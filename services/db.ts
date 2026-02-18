import { createClient } from '@supabase/supabase-js';
import { Batch, BankSettings, CashTransaction, DashboardStats, Invoice, InvoiceLine, Partner, PartnerType, PaymentMethod, Product, TransactionType, Unit, PreOrder, Gender, StockMovement, DeletedTransactionHistory } from '../types';

// --- CẤU HÌNH SUPABASE ---
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("⚠️ CHƯA CẤU HÌNH SUPABASE: Hãy kiểm tra file .env.local");
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// --- KHỞI TẠO DỮ LIỆU TRỐNG ---
const INITIAL_PRODUCTS: Product[] = [];
const INITIAL_PARTNERS: Partner[] = [];

const BASE_KEYS = {
  PRODUCTS: 'products',
  PARTNERS: 'partners',
  BATCHES: 'batches',
  INVOICES: 'invoices',
  CASH: 'cash',
  BANK: 'bank',
  GEMINI_API_KEY: 'gemini_api_key',
  PREORDERS: 'preorders',
  QUICK_CUSTOMERS: 'quick_customers',
  QUICK_ITEMS: 'quick_items',
  START_DATE: 'start_date',
  STOCK_MOVEMENTS: 'stock_movements',
  DELETED_TXN_HISTORY: 'deleted_txn_history',
};

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

class Database {
  private businessId: string = '';
  private cache: Record<string, any> = {}; 
  // Callback để báo cho React biết cần render lại khi dữ liệu thay đổi từ bên ngoài
  private onDataChange: (() => void) | null = null;

  constructor() {
    const savedId = localStorage.getItem('gttd_current_business_id');
    if (savedId) this.businessId = savedId;
  }

  // Đăng ký hàm lắng nghe sự thay đổi
  subscribe(callback: () => void) {
    this.onDataChange = callback;
  }

  // --- 1. KIỂM TRA ONLINE (Mới) ---
  async checkBusinessOnline(code: string): Promise<boolean> {
    // Kiểm tra xem trên server đã có key products của shop này chưa
    const { data, error } = await supabase
      .from('app_storage')
      .select('key')
      .eq('key', `${code}_products`)
      .maybeSingle();
    
    if (error) {
      console.error("Lỗi kiểm tra:", error);
      return false;
    }
    return !!data; // Trả về true nếu tìm thấy data
  }

  // --- 2. KHỞI TẠO & ĐỒNG BỘ ---
  async init(businessCode: string) {
    this.businessId = businessCode;
    localStorage.setItem('gttd_current_business_id', businessCode);
    console.log(`📡 Đang tải dữ liệu Cloud cho: ${businessCode}...`);

    // Tải dữ liệu mới nhất từ Server
    const keys = Object.values(BASE_KEYS).map(k => `${businessCode}_${k}`);
    const { data, error } = await supabase
      .from('app_storage')
      .select('key, value')
      .in('key', keys);

    // Xóa cache cũ để tránh lẫn lộn
    this.cache = {};

    if (data && data.length > 0) {
      data.forEach(row => {
        this.cache[row.key] = row.value;
        localStorage.setItem(row.key, JSON.stringify(row.value));
      });
      console.log("✅ Đã tải xong dữ liệu từ Cloud!");
    } else {
      console.log("⚠️ Không tìm thấy dữ liệu trên mây. Sử dụng local hoặc khởi tạo mới.");
      // Nếu không có trên mây, thử load local (phòng khi mất mạng)
      Object.values(BASE_KEYS).forEach(k => {
        const key = this.k(k);
        const local = localStorage.getItem(key);
        if (local) this.cache[key] = JSON.parse(local);
      });
    }

    await this.backfillStockMovementsFromLegacyData();

    // --- KÍCH HOẠT REALTIME ---
    // Lắng nghe thay đổi từ các thiết bị khác
    supabase.channel('custom-all-channel')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'app_storage' },
      (payload) => {
        const newRow = payload.new as { key: string, value: any };
        // Chỉ cập nhật nếu key thuộc về business hiện tại
        if (newRow && newRow.key && newRow.key.startsWith(`${this.businessId}_`)) {
          console.log("🔄 Phát hiện thay đổi từ thiết bị khác:", newRow.key);
          this.cache[newRow.key] = newRow.value;
          localStorage.setItem(newRow.key, JSON.stringify(newRow.value));
          
          // Báo cho React render lại
          if (this.onDataChange) this.onDataChange();
        }
      }
    )
    .subscribe();
  }

  // --- 3. CÁC HÀM HELPER ---
  private k(key: string): string {
    if (!this.businessId) return `temp_${key}`;
    return `${this.businessId}_${key}`;
  }

  private load<T>(key: string, defaultVal: T): T {
    const fullKey = this.k(key);
    // Ưu tiên đọc RAM (đã được sync với Cloud)
    if (this.cache[fullKey] !== undefined) {
      return this.cache[fullKey] as T;
    }
    return defaultVal;
  }

  // Lưu dữ liệu: Update RAM -> Update Local -> Đẩy lên Server
  private async save(key: string, data: any) {
    const fullKey = this.k(key);
    
    // 1. Cập nhật RAM & Local ngay lập tức (Optimistic UI)
    this.cache[fullKey] = data;
    localStorage.setItem(fullKey, JSON.stringify(data));
    if (this.onDataChange) this.onDataChange(); // Render lại ngay

    // 2. Gửi lên Supabase
    const { error } = await supabase
      .from('app_storage')
      .upsert({ key: fullKey, value: data, updated_at: new Date() });
      
    if (error) {
      console.error(`❌ Lỗi đồng bộ ${key}:`, error.message);
      throw error; // Ném lỗi để bên ngoài biết mà xử lý
    }
  }

  private toISODateTime(date: string, fallbackHour: string = '12:00:00'): string {
    const safe = (date || '').trim();
    if (!safe) return new Date().toISOString();
    if (safe.includes('T')) {
      const parsed = new Date(safe);
      return isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
    }
    const parsed = new Date(`${safe}T${fallbackHour}`);
    return isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
  }

  private async backfillStockMovementsFromLegacyData(force: boolean = false) {
    const current = this.load<StockMovement[]>(BASE_KEYS.STOCK_MOVEMENTS, []);
    const hasLegacyBackfill = current.some(item => (item.id || '').startsWith('stk-legacy-'));
    const needsLegacySaleTimeFix = current.some(item => (item.id || '').startsWith('stk-legacy-sale-') && item.occurredAt.includes('T17:00:00'));
    if (!force && hasLegacyBackfill && !needsLegacySaleTimeFix) return;

    const products = this.getProducts();
    const productNameMap = new Map(products.map(p => [p.id, p.name]));
    const invoices = this.getInvoices();
    const batches = this.load<Batch[]>(BASE_KEYS.BATCHES, []);
    const generated: StockMovement[] = [];

    const imports = invoices.filter(i => i.type === 'IMPORT');
    imports.forEach((invoice, invIdx) => {
      (invoice.lines || []).forEach((line, lineIdx) => {
        if (!line.productId || line.productId === 'MANUAL') return;
        generated.push({
          id: `stk-legacy-import-${invoice.id}-${lineIdx}`,
          occurredAt: this.toISODateTime(invoice.date, '08:00:00'),
          productId: line.productId,
          productName: line.productName || productNameMap.get(line.productId) || 'Không rõ sản phẩm',
          gender: line.gender || 'MALE',
          source: 'IMPORT',
          deltaKg: Number(line.qtyKg) || 0,
          deltaCon: Number(line.qtyCon) || 0,
          note: `Backfill từ hóa đơn nhập ${invoice.code || invIdx + 1}`,
        });
      });
    });

    const exports = invoices.filter(i => i.type === 'EXPORT');
    exports.forEach((invoice, invIdx) => {
      (invoice.lines || []).forEach((line, lineIdx) => {
        if (!line.productId || line.productId === 'MANUAL') return;
        const qtyKg = Number(line.qtyKg) || 0;
        const qtyCon = Number(line.qtyCon) || 0;
        if (qtyKg <= 0 && qtyCon <= 0) return;
        generated.push({
          id: `stk-legacy-sale-${invoice.id}-${lineIdx}`,
          occurredAt: this.toISODateTime(invoice.date, '00:00:00'),
          productId: line.productId,
          productName: line.productName || productNameMap.get(line.productId) || 'Không rõ sản phẩm',
          gender: line.gender || 'MALE',
          source: 'SALE',
          deltaKg: -qtyKg,
          deltaCon: -qtyCon,
          note: `Backfill từ hóa đơn bán ${invoice.code || invIdx + 1}`,
        });
      });
    });

    const internalAdjustments = batches.filter(b => b.supplierId === 'INTERNAL');
    internalAdjustments.forEach((batch, idx) => {
      generated.push({
        id: `stk-legacy-adj-${batch.id}-${idx}`,
        occurredAt: this.toISODateTime(batch.date, '12:00:00'),
        productId: batch.productId,
        productName: productNameMap.get(batch.productId) || 'Không rõ sản phẩm',
        gender: batch.gender || 'MALE',
        batchId: batch.id,
        source: 'ADJUSTMENT',
        deltaKg: Number(batch.qtyInKg) || 0,
        deltaCon: Number(batch.qtyInCon) || 0,
        note: 'Backfill từ lô điều chỉnh kho cũ',
      });
    });

    const merged = [...generated, ...current];
    const seen = new Set<string>();
    const deduped: StockMovement[] = [];
    for (const item of merged) {
      const key = item.id || `${item.occurredAt}-${item.productId}-${item.source}-${item.deltaKg}-${item.deltaCon}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
    }

    deduped.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
    await this.save(BASE_KEYS.STOCK_MOVEMENTS, deduped.slice(0, 2000));
  }

  checkBusinessExists(id: string): boolean {
     // Hàm này chỉ dùng để check local state sau khi đã init
     return !!this.cache[`${id}_${BASE_KEYS.PRODUCTS}`];
  }

  setBusinessId(id: string) {
    this.businessId = id;
    localStorage.setItem('gttd_current_business_id', id);
  }

  initStartDate() {
    // Chỉ init nếu trên server chưa có (cache chưa có)
    const key = BASE_KEYS.START_DATE;
    if (!this.load(key, null)) {
       const date = new Date().toISOString().split('T')[0];
       this.save(key, date);
    }
  }

  getStartDate(): string {
    return this.load(BASE_KEYS.START_DATE, new Date().toISOString().split('T')[0]);
  }

  // --- CÁC HÀM GET/SET LOGIC NGHIỆP VỤ (GIỮ NGUYÊN LOGIC, CHỈ GỌI LOAD/SAVE) ---

  getProducts(): Product[] {
    return this.load<Product[]>(BASE_KEYS.PRODUCTS, []);
  }
  
  // Hàm này để init lần đầu cho shop mới
  async seedNewBusiness() {
      console.log("🌱 Đang khởi tạo dữ liệu trống lên Cloud...");
      await Promise.all([
        this.save(BASE_KEYS.PRODUCTS, INITIAL_PRODUCTS),
        this.save(BASE_KEYS.PARTNERS, INITIAL_PARTNERS),
        this.save(BASE_KEYS.START_DATE, new Date().toISOString().split('T')[0])
      ]);
      console.log("✅ Đã khởi tạo xong dữ liệu trống!");
  }

  getPartners(type?: PartnerType): Partner[] {
    let partners = this.load<Partner[]>(BASE_KEYS.PARTNERS, []);
    if (type) return partners.filter(p => p.type === type);
    return partners;
  }

  getBatches(productId?: string): Batch[] {
    const invoices = this.getInvoices();
    const rawBatches = this.load<Batch[]>(BASE_KEYS.BATCHES, []);
    const recalculated = this.rebuildBatchesAndExportCogs(invoices, rawBatches);
    const sorted = recalculated.batches.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return productId ? sorted.filter(b => b.productId === productId) : sorted;
  }

  private toMovementDate(isoDate: string, fallbackHour: string = '12:00:00') {
    return this.toISODateTime(isoDate, fallbackHour);
  }

  private rebuildBatchesAndExportCogs(invoices: Invoice[], sourceBatches: Batch[]) {
    const groupedByType = new Map<string, Batch>();

    sourceBatches.forEach((batch) => {
      const gender = (batch.gender || 'MALE') as Gender;
      const key = `${batch.productId}__${gender}`;
      const qtyInCon = Number(batch.qtyInCon) || 0;
      const qtyInKg = Number(batch.qtyInKg) || 0;
      const totalCost = Number(batch.totalCost) || 0;

      const current = groupedByType.get(key) || {
        id: `stock-${batch.productId}-${gender}`,
        code: `STOCK-${batch.productId}-${gender}`,
        productId: batch.productId,
        gender,
        supplierId: 'AGGREGATED',
        supplierName: 'Tồn kho gộp',
        date: batch.date,
        qtyInCon: 0,
        qtyInKg: 0,
        qtyRemCon: 0,
        qtyRemKg: 0,
        baseCost: 0,
        extraCost: 0,
        totalCost: 0,
        costPerKg: 0,
        costPerCon: 0,
        status: 'OPEN' as const,
      };

      current.qtyInCon += qtyInCon;
      current.qtyInKg += qtyInKg;
      current.qtyRemCon += qtyInCon;
      current.qtyRemKg += qtyInKg;
      current.totalCost += totalCost;

      if (!current.date || new Date(batch.date).getTime() > new Date(current.date).getTime()) {
        current.date = batch.date;
      }

      current.costPerKg = current.qtyInKg > 0 ? current.totalCost / current.qtyInKg : 0;
      current.costPerCon = current.qtyInCon > 0 ? current.totalCost / current.qtyInCon : 0;
      current.status = (current.qtyRemKg <= 0.1 && current.qtyRemCon <= 0) ? 'CLOSED' : 'OPEN';

      groupedByType.set(key, current);
    });

    const sortedExportInvoices = invoices
      .filter(inv => inv.type === 'EXPORT')
      .sort((a, b) => {
        const diff = new Date(a.date).getTime() - new Date(b.date).getTime();
        if (diff !== 0) return diff;
        return (a.code || '').localeCompare(b.code || '');
      });

    const cogsByInvoice: Record<string, number> = {};
    const saleMovements: StockMovement[] = [];

    sortedExportInvoices.forEach((invoice) => {
      let invoiceCogs = 0;
      const saleLines = (invoice.lines || []).filter(line => line.productId !== 'MANUAL');
      const products = this.getProducts();

      saleLines.forEach((line, lineIdx) => {
        const targetGender = line.gender || 'MALE';
        let remainingKg = Number(line.qtyKg) || 0;
        let remainingCon = Number(line.qtyCon) || 0;

        const key = `${line.productId}__${targetGender}`;
        const bucket = groupedByType.get(key);

        if (!bucket) {
          const fallbackProduct = products.find(p => p.id === line.productId);
          const fallbackCost = targetGender === 'MALE'
            ? (Number(fallbackProduct?.costMale) || 0)
            : (Number(fallbackProduct?.costFemale) || 0);
          if (remainingKg > 0 && fallbackCost > 0) {
            invoiceCogs += remainingKg * fallbackCost;
          }
          return;
        }

        const takeKg = Math.min(Number(bucket.qtyRemKg) || 0, remainingKg);
        const takeCon = Math.min(Number(bucket.qtyRemCon) || 0, remainingCon);

        if (takeKg > 0 || takeCon > 0) {
          invoiceCogs += takeKg * (Number(bucket.costPerKg) || 0);
          bucket.qtyRemKg = Math.max(0, (Number(bucket.qtyRemKg) || 0) - takeKg);
          bucket.qtyRemCon = Math.max(0, (Number(bucket.qtyRemCon) || 0) - takeCon);
          bucket.status = (bucket.qtyRemKg <= 0.1 && bucket.qtyRemCon <= 0) ? 'CLOSED' : 'OPEN';
          remainingKg -= takeKg;
          remainingCon -= takeCon;

          saleMovements.push({
            id: `stk-sale-${invoice.id}-${lineIdx}-${bucket.id}`,
            occurredAt: this.toMovementDate(invoice.date, '12:00:00'),
            productId: line.productId,
            productName: line.productName,
            gender: targetGender,
            batchId: bucket.id,
            invoiceId: invoice.id,
            invoiceCode: invoice.code,
            source: 'SALE',
            deltaKg: -takeKg,
            deltaCon: -takeCon,
            afterKg: bucket.qtyRemKg,
            afterCon: bucket.qtyRemCon,
            note: `Xuất bán ${invoice.partnerName} (${invoice.code})`,
          });
        }

        if (remainingKg > 0) {
          const fallbackProduct = products.find(p => p.id === line.productId);
          const fallbackCost = targetGender === 'MALE'
            ? (Number(fallbackProduct?.costMale) || 0)
            : (Number(fallbackProduct?.costFemale) || 0);
          if (fallbackCost > 0) {
            invoiceCogs += remainingKg * fallbackCost;
          }
        }
      });

      cogsByInvoice[invoice.id] = invoiceCogs;
    });

    const manualDeltasByType = this.getManualStockMovements().reduce((acc, movement) => {
      const key = `${movement.productId}__${movement.gender || 'MALE'}`;
      if (!acc[key]) {
        acc[key] = { deltaCon: 0, deltaKg: 0 };
      }
      acc[key].deltaCon += Number(movement.deltaCon) || 0;
      acc[key].deltaKg += Number(movement.deltaKg) || 0;
      return acc;
    }, {} as Record<string, { deltaCon: number; deltaKg: number }>);

    Object.entries(manualDeltasByType).forEach(([key, delta]) => {
      const [productId, genderRaw] = key.split('__');
      const gender = (genderRaw || 'MALE') as Gender;
      const current = groupedByType.get(key) || {
        id: `stock-${productId}-${gender}`,
        code: `STOCK-${productId}-${gender}`,
        productId,
        gender,
        supplierId: 'AGGREGATED',
        supplierName: 'Tồn kho gộp',
        date: new Date().toISOString().split('T')[0],
        qtyInCon: 0,
        qtyInKg: 0,
        qtyRemCon: 0,
        qtyRemKg: 0,
        baseCost: 0,
        extraCost: 0,
        totalCost: 0,
        costPerKg: 0,
        costPerCon: 0,
        status: 'OPEN' as const,
      };

      current.qtyRemCon = Math.max(0, (Number(current.qtyRemCon) || 0) + delta.deltaCon);
      current.qtyRemKg = Math.max(0, (Number(current.qtyRemKg) || 0) + delta.deltaKg);
      current.status = (current.qtyRemKg <= 0.1 && current.qtyRemCon <= 0) ? 'CLOSED' : 'OPEN';
      groupedByType.set(key, current);
    });

    return { batches: Array.from(groupedByType.values()), cogsByInvoice, saleMovements };
  }

  private buildImportMovements(invoices: Invoice[]): StockMovement[] {
    return invoices
      .filter(inv => inv.type === 'IMPORT')
      .flatMap((invoice) => (invoice.lines || []).map((line, idx) => ({
        id: `stk-import-${invoice.id}-${idx}`,
        occurredAt: this.toMovementDate(invoice.date, '08:00:00'),
        productId: line.productId,
        productName: line.productName,
        gender: line.gender || 'MALE',
        invoiceId: invoice.id,
        invoiceCode: invoice.code,
        source: 'IMPORT' as const,
        deltaKg: Number(line.qtyKg) || 0,
        deltaCon: Number(line.qtyCon) || 0,
        note: `Nhập hàng ${invoice.partnerName} (${invoice.code})`,
      })));
  }

  private buildAdjustmentMovements(batches: Batch[], products: Product[]): StockMovement[] {
    const productMap = new Map(products.map(p => [p.id, p.name]));
    return batches
      .filter(batch => batch.supplierId === 'INTERNAL')
      .map((batch) => ({
        id: `stk-adjust-${batch.id}`,
        occurredAt: this.toMovementDate(batch.date, '10:00:00'),
        productId: batch.productId,
        productName: productMap.get(batch.productId) || batch.supplierName || 'Không rõ sản phẩm',
        gender: batch.gender || 'MALE',
        batchId: batch.id,
        source: 'ADJUSTMENT' as const,
        deltaKg: Number(batch.qtyInKg) || 0,
        deltaCon: Number(batch.qtyInCon) || 0,
        note: batch.supplierName || 'Điều chỉnh kho',
      }));
  }

  private getManualStockMovements(): StockMovement[] {
    return this.load<StockMovement[]>(BASE_KEYS.STOCK_MOVEMENTS, []).filter(item => item.source === 'MANUAL_EDIT');
  }

  getStockMovements(limit?: number): StockMovement[] {
    const invoices = this.getInvoices();
    const rawBatches = this.load<Batch[]>(BASE_KEYS.BATCHES, []);
    const products = this.getProducts();
    const { saleMovements } = this.rebuildBatchesAndExportCogs(invoices, rawBatches);
    const importMovements = this.buildImportMovements(invoices);
    const adjustmentMovements = this.buildAdjustmentMovements(rawBatches, products);

    const all = [...importMovements, ...adjustmentMovements, ...saleMovements];
    const seen = new Set<string>();
    const movements = all
      .filter(item => {
        const key = item.id || `${item.occurredAt}-${item.productId}-${item.gender}-${item.source}-${item.deltaCon}-${item.deltaKg}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
    return limit ? movements.slice(0, limit) : movements;
  }

  getDeletedTransactionHistories(limit?: number): DeletedTransactionHistory[] {
    const logs = this.load<DeletedTransactionHistory[]>(BASE_KEYS.DELETED_TXN_HISTORY, [])
      .sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());
    return limit ? logs.slice(0, limit) : logs;
  }

  getInvoices(): Invoice[] {
    return this.load<Invoice[]>(BASE_KEYS.INVOICES, []).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  getInvoice(id: string): Invoice | undefined {
    return this.getInvoices().find(i => i.id === id);
  }

  getCashTransactions(): CashTransaction[] {
    return this.load<CashTransaction[]>(BASE_KEYS.CASH, []).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  getBankSettings(): BankSettings | null {
    return this.load<BankSettings | null>(BASE_KEYS.BANK, null);
  }

  getGeminiApiKey(): string {
    return this.load<string>(BASE_KEYS.GEMINI_API_KEY, '');
  }

  getPreOrders(): PreOrder[] {
    return this.load<PreOrder[]>(BASE_KEYS.PREORDERS, []).sort((a, b) => new Date(a.deliveryTime).getTime() - new Date(b.deliveryTime).getTime());
  }

  getQuickCustomers(): { name: string; phone?: string }[] {
    return this.load<{ name: string; phone?: string }[]>(BASE_KEYS.QUICK_CUSTOMERS, []);
  }

  getQuickItems(): string[] {
    return this.load<string[]>(BASE_KEYS.QUICK_ITEMS, []);
  }

  private appendStockMovements(entries: StockMovement[]) {
    if (!entries || entries.length === 0) return;
    const manualEntries = entries.filter(item => item.source === 'MANUAL_EDIT');
    if (manualEntries.length === 0) return;
    const history = this.getManualStockMovements();
    this.save(BASE_KEYS.STOCK_MOVEMENTS, [...manualEntries, ...history].slice(0, 2000));
  }

  // --- WRITE FUNCTIONS ---
  saveBankSettings(settings: BankSettings) { this.save(BASE_KEYS.BANK, settings); }
  async saveGeminiApiKey(apiKey: string) {
    const safeKey = (apiKey || '').trim();
    await this.save(BASE_KEYS.GEMINI_API_KEY, safeKey);
  }
  
  saveProduct(product: Product) {
    const products = this.getProducts(); // Lấy bản mới nhất từ cache (đã sync)
    const index = products.findIndex(p => p.id === product.id);
    if (index >= 0) products[index] = product;
    else products.push(product);
    this.save(BASE_KEYS.PRODUCTS, products);
  }

  deleteProduct(id: string) {
    const products = this.getProducts();
    this.save(BASE_KEYS.PRODUCTS, products.filter(p => p.id !== id));
  }

  savePartner(partner: Partner) {
    const partners = this.getPartners();
    const index = partners.findIndex(p => p.id === partner.id);
    if (index >= 0) partners[index] = partner;
    else partners.push(partner);
    this.save(BASE_KEYS.PARTNERS, partners);
  }

  deletePartner(id: string) {
    const partners = this.getPartners();
    this.save(BASE_KEYS.PARTNERS, partners.filter(p => p.id !== id));
  }

  savePreOrder(order: PreOrder) {
    const list = this.getPreOrders();
    const index = list.findIndex(p => p.id === order.id);
    if (index >= 0) list[index] = order;
    else list.push(order);
    this.save(BASE_KEYS.PREORDERS, list);
  }

  saveQuickCustomer(name: string, phone?: string) {
    const safeName = (name || '').trim();
    const safePhone = (phone || '').trim();
    if (!safeName) return;

    const normalize = (value: string) => (value || '').trim().toLowerCase();
    const customers = this.getPartners(PartnerType.CUSTOMER);
    const existedInCustomers = customers.some(c => {
      const customerName = normalize(c.name);
      const customerPhone = normalize(c.phone || '');
      const inputName = normalize(safeName);
      const inputPhone = normalize(safePhone);

      if (inputPhone && customerPhone && inputPhone === customerPhone) return true;
      return customerName === inputName && customerPhone === inputPhone;
    });
    if (existedInCustomers) return;

    const list = this.getQuickCustomers();
    const index = list.findIndex(c => normalize(c.name) === normalize(safeName) && normalize(c.phone || '') === normalize(safePhone));
    if (index >= 0) {
      const updated = list[index];
      list.splice(index, 1);
      list.unshift(updated);
    } else {
      list.unshift({ name: safeName, phone: safePhone });
    }

    this.save(BASE_KEYS.QUICK_CUSTOMERS, list.slice(0, 50));
  }

  deleteQuickCustomer(name: string, phone?: string) {
    const normalize = (value: string) => (value || '').trim().toLowerCase();
    const targetName = normalize(name || '');
    const targetPhone = normalize(phone || '');
    const list = this.getQuickCustomers();
    const filtered = list.filter(c => !(normalize(c.name) === targetName && normalize(c.phone || '') === targetPhone));
    this.save(BASE_KEYS.QUICK_CUSTOMERS, filtered);
  }

  saveQuickItem(name: string) {
    const safeName = (name || '').trim();
    if (!safeName) return;

    const list = this.getQuickItems();
    const filtered = list.filter(i => i.toLowerCase() !== safeName.toLowerCase());
    this.save(BASE_KEYS.QUICK_ITEMS, [safeName, ...filtered].slice(0, 80));
  }

  deletePreOrder(id: string) {
    const list = this.getPreOrders();
    this.save(BASE_KEYS.PREORDERS, list.filter(p => p.id !== id));
  }

  updateBatch(id: string, updates: Partial<Batch>) {
    const buckets = this.getBatches();
    const currentBucket = buckets.find(b => b.id === id);
    if (!currentBucket) return;

    const nextKg = updates.qtyRemKg !== undefined ? Number(updates.qtyRemKg) || 0 : (Number(currentBucket.qtyRemKg) || 0);
    const nextCon = updates.qtyRemCon !== undefined ? Number(updates.qtyRemCon) || 0 : (Number(currentBucket.qtyRemCon) || 0);

    const deltaKg = nextKg - (Number(currentBucket.qtyRemKg) || 0);
    const deltaCon = nextCon - (Number(currentBucket.qtyRemCon) || 0);
    if (Math.abs(deltaKg) <= 0.0001 && Math.abs(deltaCon) <= 0.0001) return;

    const product = this.getProducts().find(p => p.id === currentBucket.productId);
    this.appendStockMovements([
      {
        id: `stk-manual-${Date.now()}-${currentBucket.productId}-${currentBucket.gender}`,
        occurredAt: new Date().toISOString(),
        productId: currentBucket.productId,
        productName: product?.name || 'Không rõ sản phẩm',
        gender: currentBucket.gender,
        source: 'MANUAL_EDIT',
        deltaKg,
        deltaCon,
        afterKg: Math.max(0, nextKg),
        afterCon: Math.max(0, nextCon),
        note: 'Sửa tồn kho theo loại gà',
      }
    ]);
  }

  // --- TRANSACTION LOGIC ---
  async createPurchase(supplierId: string, date: string, lines: any[], extraCost: number, paidAmount: number) {
    const products = this.getProducts();
    const partners = this.getPartners();
    const batches = this.load<Batch[]>(BASE_KEYS.BATCHES, []);
    const invoices = this.getInvoices();
    const cash = this.getCashTransactions();

    const supplier = partners.find(p => p.id === supplierId);
    if (!supplier) throw new Error("Supplier not found");

    const code = `IN-${date.replace(/-/g, '')}-${invoices.length + 1}`;
    let totalGoods = 0;
    let totalWeight = 0;
    const invoiceLines: InvoiceLine[] = [];
    
    lines.forEach(l => { totalGoods += l.qtyKg * l.price; totalWeight += l.qtyKg; });

    const newBatches: Batch[] = lines.map((l, idx) => {
      const lineTotal = l.qtyKg * l.price;
      const ratio = totalGoods > 0 ? lineTotal / totalGoods : 0;
      const allocatedExtra = extraCost * ratio;
      const totalBatchCost = lineTotal + allocatedExtra;
      
      const prod = products.find(p => p.id === l.productId);
      if (prod) {
        if (l.gender === 'MALE') prod.costMale = l.price;
        else prod.costFemale = l.price;
      } 

      invoiceLines.push({
        productId: l.productId,
        productName: prod ? prod.name : 'Unknown',
        qtyCon: l.qtyCon,
        qtyKg: l.qtyKg,
        unit: Unit.KG,
        price: l.price,
        amount: lineTotal,
        gross: l.gross, tare: l.tare, details: l.details,
        gender: l.gender || 'MALE'
      });

      return {
        id: `batch-${Date.now()}-${idx}`,
        code: `${code}-B${idx+1}`,
        productId: l.productId,
        gender: l.gender || 'MALE',
        supplierId,
        supplierName: supplier.name,
        date,
        qtyInCon: l.qtyCon,
        qtyInKg: l.qtyKg,
        qtyRemCon: l.qtyCon,
        qtyRemKg: l.qtyKg,
        baseCost: lineTotal,
        extraCost: allocatedExtra,
        totalCost: totalBatchCost,
        costPerKg: l.qtyKg > 0 ? totalBatchCost / l.qtyKg : 0,
        costPerCon: l.qtyCon > 0 ? totalBatchCost / l.qtyCon : 0,
        status: 'OPEN'
      };
    });
    const stockMovements: StockMovement[] = newBatches.map((batch) => {
      const product = products.find(p => p.id === batch.productId);
      return {
        id: `stk-${Date.now()}-${batch.id}`,
        occurredAt: new Date().toISOString(),
        productId: batch.productId,
        productName: product?.name || 'Không rõ sản phẩm',
        gender: batch.gender,
        batchId: batch.id,
        source: 'IMPORT',
        deltaKg: batch.qtyInKg,
        deltaCon: batch.qtyInCon,
        afterKg: batch.qtyRemKg,
        afterCon: batch.qtyRemCon,
        note: `Nhập hàng ${supplier.name}`,
      };
    });

    this.save(BASE_KEYS.PRODUCTS, products);
    const totalAmount = totalGoods + extraCost;
    
    const invoice: Invoice = {
      id: `inv-${Date.now()}`,
      code, type: 'IMPORT', date, partnerId: supplierId, partnerName: supplier.name,
      totalAmount, paidAmount: totalAmount, debtAmount: 0, lines: invoiceLines
    };

    this.save(BASE_KEYS.BATCHES, [...batches, ...newBatches]);
    this.appendStockMovements(stockMovements);
    this.save(BASE_KEYS.INVOICES, [invoice, ...invoices]);
    
    const txn: CashTransaction = {
      id: `txn-${Date.now()}`, date: new Date().toISOString(), type: TransactionType.EXPENSE,
      amount: totalAmount, description: `Nhập hàng: ${supplier.name} (${totalWeight.toFixed(1)}kg)`, refId: invoice.id
    };
    this.save(BASE_KEYS.CASH, [txn, ...cash]);

    await delay(300); 
    return invoice;
  }

  async createStockAdjustment(date: string, lines: any[]) {
    const products = this.getProducts();
    const stockMovements: StockMovement[] = lines.map((line: any, idx: number) => {
      const product = products.find(p => p.id === line.productId);
      const gender = (line.gender || 'MALE') as Gender;

      const prod = products.find(p => p.id === line.productId);
      if (prod) {
        if (gender === 'MALE') prod.costMale = line.price;
        else prod.costFemale = line.price;
      }

      return {
        id: `stk-adjust-${Date.now()}-${idx}`,
        occurredAt: this.toISODateTime(date, '10:00:00'),
        productId: line.productId,
        productName: product?.name || 'Không rõ sản phẩm',
        gender,
        source: 'MANUAL_EDIT',
        deltaKg: Number(line.qtyKg) || 0,
        deltaCon: Number(line.qtyCon) || 0,
        note: 'Tạo tồn kho/kiểm kho ban đầu',
      };
    });

    this.save(BASE_KEYS.PRODUCTS, products);
    this.appendStockMovements(stockMovements);

    await delay(300);
    return true;
  }

  async createSale(customerId: string, date: string, lines: any[], paidAmount: number, paymentMethod?: PaymentMethod) {
    const partners = this.getPartners();
    const rawBatches = this.load<Batch[]>(BASE_KEYS.BATCHES, []);
    const invoices = this.getInvoices();
    const cash = this.getCashTransactions();
    const products = this.getProducts();

    const customer = partners.find(p => p.id === customerId);
    if (!customer) throw new Error("Customer not found");

    const code = `OUT-${date.replace(/-/g, '')}-${invoices.filter(i => i.type === 'EXPORT').length + 1}`;
    let totalAmount = 0;
    const invoiceLines: InvoiceLine[] = [];

    for (const line of lines) {
      const lineAmount = (line.unit === Unit.KG ? line.qtyKg : line.qtyCon) * line.price;
      totalAmount += lineAmount;

      if (line.productId === 'MANUAL') {
        invoiceLines.push({ productId: 'MANUAL', productName: line.productName || 'Hàng ngoài', qtyCon: line.qtyCon, qtyKg: line.qtyKg, unit: line.unit, price: line.price, amount: lineAmount, gender: line.gender || 'MALE' });
        continue;
      }

      const prod = products.find(p => p.id === line.productId)!;
      invoiceLines.push({ productId: line.productId, productName: prod.name, qtyCon: line.qtyCon, qtyKg: line.qtyKg, unit: line.unit, price: line.price, amount: lineAmount, gender: line.gender || 'MALE' });
    }

    const debtAmount = totalAmount - paidAmount;
    const finalPaymentMethod = paymentMethod || (debtAmount === totalAmount ? PaymentMethod.DEBT : (paidAmount > 0 ? PaymentMethod.CASH : undefined));
    const invoice: Invoice = {
      id: `inv-${Date.now()}`, code, type: 'EXPORT', date, partnerId: customerId, partnerName: customer.name,
      totalAmount, paidAmount, debtAmount, lines: invoiceLines, cogs: 0,
      paymentMethod: finalPaymentMethod,
    };

    const nextInvoices = [invoice, ...invoices];
    const recalculated = this.rebuildBatchesAndExportCogs(nextInvoices, rawBatches);
    const invoicesWithCogs = nextInvoices.map(inv => inv.type === 'EXPORT'
      ? { ...inv, cogs: recalculated.cogsByInvoice[inv.id] || 0 }
      : inv
    );

    this.save(BASE_KEYS.INVOICES, invoicesWithCogs);

    if (paidAmount > 0) {
      const description = finalPaymentMethod === PaymentMethod.TRANSFER
        ? `Thu chuyển khoản: ${customer.name}`
        : `Thu bán hàng: ${customer.name}`;
      const txn: CashTransaction = { id: `txn-${Date.now()}`, date: new Date().toISOString(), type: TransactionType.INCOME, amount: paidAmount, description, refId: invoice.id };
      this.save(BASE_KEYS.CASH, [txn, ...cash]);
    }

    customer.debt += debtAmount;
    this.save(BASE_KEYS.PARTNERS, partners);

    await delay(300);
    return invoice;
  }

  async updateExportInvoice(
    invoiceId: string,
    updatedLinesInput: Array<Partial<InvoiceLine> & { productId: string; productName: string; gender: Gender; qtyKg: number; qtyCon: number; price: number }>,
    reason: string,
    options?: {
      paymentMethod?: PaymentMethod;
      paidAmount?: number;
    }
  ) {
    const safeReason = (reason || '').trim();
    if (!safeReason) throw new Error('Vui lòng nhập lý do chỉnh sửa.');

    const invoices = this.getInvoices();
    const invoiceIndex = invoices.findIndex(i => i.id === invoiceId);
    if (invoiceIndex < 0) throw new Error('Không tìm thấy hoá đơn cần chỉnh sửa.');

    const targetInvoice = invoices[invoiceIndex];
    if (targetInvoice.type !== 'EXPORT') {
      throw new Error('Chỉ hỗ trợ chỉnh sửa hoá đơn bán hàng.');
    }

    const normalizedLines: InvoiceLine[] = updatedLinesInput.map((line) => {
      const qtyKg = Math.max(0, Number(line.qtyKg) || 0);
      const qtyCon = Math.max(0, Number(line.qtyCon) || 0);
      const rawPrice = Number(line.price) || 0;
      const price = line.productId === 'MANUAL' ? rawPrice : Math.max(0, rawPrice);
      const amount = (qtyKg > 0 ? qtyKg : qtyCon) * price;

      return {
        productId: line.productId,
        productName: line.productName,
        gender: line.gender || 'MALE',
        qtyKg,
        qtyCon,
        price,
        amount,
        unit: qtyKg > 0 ? Unit.KG : Unit.CON,
        gross: line.gross,
        tare: line.tare,
        details: line.details,
      };
    });

    if (normalizedLines.length === 0) {
      throw new Error('Hoá đơn phải có ít nhất một dòng hàng.');
    }

    const hasInvalidLine = normalizedLines.some(l => {
      if (l.qtyKg <= 0 && l.qtyCon <= 0) return true;
      if (l.price === 0) return true;
      if (l.price < 0 && l.productId !== 'MANUAL') return true;
      return false;
    });
    if (hasInvalidLine) {
      throw new Error('Mỗi dòng cần có số lượng và đơn giá hợp lệ.');
    }

    const previousDebt = Number(targetInvoice.debtAmount) || 0;
    const newTotalAmount = normalizedLines.reduce((sum, line) => sum + line.amount, 0);
    const requestedMethod = options?.paymentMethod;

    let requestedPaid = options?.paidAmount;
    if (requestedMethod === PaymentMethod.DEBT) {
      requestedPaid = 0;
    }

    if (requestedPaid === undefined || requestedPaid === null || Number.isNaN(Number(requestedPaid))) {
      if (requestedMethod === PaymentMethod.CASH || requestedMethod === PaymentMethod.TRANSFER) {
        requestedPaid = newTotalAmount;
      } else {
        requestedPaid = Number(targetInvoice.paidAmount) || 0;
      }
    }

    const newPaidAmount = Math.min(Math.max(Number(requestedPaid) || 0, 0), newTotalAmount);
    const newDebtAmount = Math.max(0, newTotalAmount - newPaidAmount);

    const nextPaymentMethod = requestedMethod
      ? (requestedMethod === PaymentMethod.DEBT || newPaidAmount <= 0
          ? PaymentMethod.DEBT
          : (requestedMethod === PaymentMethod.TRANSFER ? PaymentMethod.TRANSFER : PaymentMethod.CASH))
      : (newDebtAmount <= 0
          ? (targetInvoice.paymentMethod === PaymentMethod.TRANSFER ? PaymentMethod.TRANSFER : PaymentMethod.CASH)
          : (newPaidAmount <= 0 ? PaymentMethod.DEBT : (targetInvoice.paymentMethod === PaymentMethod.TRANSFER ? PaymentMethod.TRANSFER : PaymentMethod.CASH)));

    const historyEntry = {
      editedAt: new Date().toISOString(),
      reason: safeReason,
      previousTotalAmount: Number(targetInvoice.totalAmount) || 0,
      newTotalAmount,
      previousLines: (targetInvoice.lines || []).map(line => ({ ...line })),
      updatedLines: normalizedLines.map(line => ({ ...line })),
    };

    const updatedInvoice: Invoice = {
      ...targetInvoice,
      lines: normalizedLines,
      totalAmount: newTotalAmount,
      paidAmount: newPaidAmount,
      debtAmount: newDebtAmount,
      paymentMethod: nextPaymentMethod,
      editHistory: [historyEntry, ...(targetInvoice.editHistory || [])],
    };

    invoices[invoiceIndex] = updatedInvoice;
    const rawBatches = this.load<Batch[]>(BASE_KEYS.BATCHES, []);
    const recalculated = this.rebuildBatchesAndExportCogs(invoices, rawBatches);
    const invoicesWithCogs = invoices.map(inv => inv.type === 'EXPORT'
      ? { ...inv, cogs: recalculated.cogsByInvoice[inv.id] || 0 }
      : inv
    );

    this.save(BASE_KEYS.INVOICES, invoicesWithCogs);

    const partners = this.getPartners();
    const partner = partners.find(p => p.id === updatedInvoice.partnerId);
    if (partner) {
      const deltaDebt = newDebtAmount - previousDebt;
      partner.debt = Math.max(0, (Number(partner.debt) || 0) + deltaDebt);
      this.save(BASE_KEYS.PARTNERS, partners);
    }

    const cashTxns = this.getCashTransactions();
    const incomeTxnsForInvoice = cashTxns.filter(t => t.refId === invoiceId && t.type === TransactionType.INCOME);
    let nextCashTxns = [...cashTxns];

    if (newPaidAmount > 0) {
      const nextDescription = nextPaymentMethod === PaymentMethod.TRANSFER
        ? `Thu chuyển khoản: ${updatedInvoice.partnerName}`
        : `Thu bán hàng: ${updatedInvoice.partnerName}`;

      if (incomeTxnsForInvoice.length > 0) {
        const firstIncomeTxnId = incomeTxnsForInvoice[0].id;
        nextCashTxns = nextCashTxns.map(txn => txn.id === firstIncomeTxnId
          ? { ...txn, amount: newPaidAmount, description: nextDescription }
          : txn
        );
      } else {
        nextCashTxns.unshift({
          id: `txn-edit-${Date.now()}`,
          date: new Date().toISOString(),
          type: TransactionType.INCOME,
          amount: newPaidAmount,
          description: nextDescription,
          refId: invoiceId,
        });
      }
    } else if (incomeTxnsForInvoice.length > 0) {
      const incomeIds = new Set(incomeTxnsForInvoice.map(t => t.id));
      nextCashTxns = nextCashTxns.filter(txn => !incomeIds.has(txn.id));
    }

    this.save(BASE_KEYS.CASH, nextCashTxns);

    await delay(150);
    return updatedInvoice;
  }

  getDeleteTransactionImpact(params: { invoiceId?: string; cashTransactionId?: string }) {
    const { invoiceId, cashTransactionId } = params;
    const invoices = this.getInvoices();
    const cashTxns = this.getCashTransactions();

    const buildStockMap = (batches: Batch[]) => {
      const map = new Map<string, {
        productId: string;
        productName: string;
        gender: Gender;
        qtyCon: number;
        qtyKg: number;
      }>();

      batches
        .filter(batch => batch.status === 'OPEN' || batch.qtyRemCon > 0 || batch.qtyRemKg > 0)
        .forEach(batch => {
          const product = this.getProducts().find(p => p.id === batch.productId);
          const key = `${batch.productId}__${batch.gender || 'MALE'}`;
          const current = map.get(key) || {
            productId: batch.productId,
            productName: product?.name || 'Không rõ sản phẩm',
            gender: (batch.gender || 'MALE') as Gender,
            qtyCon: 0,
            qtyKg: 0,
          };
          current.qtyCon += Number(batch.qtyRemCon) || 0;
          current.qtyKg += Number(batch.qtyRemKg) || 0;
          map.set(key, current);
        });

      return map;
    };

    const buildDetailDiff = (beforeMap: Map<string, any>, afterMap: Map<string, any>) => {
      const keys = new Set<string>([...beforeMap.keys(), ...afterMap.keys()]);
      const details = Array.from(keys).map((key) => {
        const before = beforeMap.get(key) || { productId: key.split('__')[0], productName: 'Không rõ sản phẩm', gender: key.split('__')[1] as Gender, qtyCon: 0, qtyKg: 0 };
        const after = afterMap.get(key) || { ...before, qtyCon: 0, qtyKg: 0 };
        const deltaCon = (Number(after.qtyCon) || 0) - (Number(before.qtyCon) || 0);
        const deltaKg = (Number(after.qtyKg) || 0) - (Number(before.qtyKg) || 0);
        return {
          productId: before.productId,
          productName: before.productName,
          gender: before.gender,
          deltaCon,
          deltaKg,
          beforeCon: Number(before.qtyCon) || 0,
          afterCon: Number(after.qtyCon) || 0,
          beforeKg: Number(before.qtyKg) || 0,
          afterKg: Number(after.qtyKg) || 0,
        };
      }).filter(item => Math.abs(item.deltaCon) > 0 || Math.abs(item.deltaKg) > 0)
        .sort((a, b) => Math.abs(b.deltaCon) - Math.abs(a.deltaCon));

      return details;
    };

    const summarizeDetails = (details: Array<{ deltaCon: number; deltaKg: number }>) => {
      let stockIncreaseCon = 0;
      let stockDecreaseCon = 0;
      let stockIncreaseKg = 0;
      let stockDecreaseKg = 0;

      details.forEach(item => {
        if (item.deltaCon > 0) stockIncreaseCon += item.deltaCon;
        else if (item.deltaCon < 0) stockDecreaseCon += Math.abs(item.deltaCon);

        if (item.deltaKg > 0) stockIncreaseKg += item.deltaKg;
        else if (item.deltaKg < 0) stockDecreaseKg += Math.abs(item.deltaKg);
      });

      return { stockIncreaseCon, stockDecreaseCon, stockIncreaseKg, stockDecreaseKg };
    };

    if (invoiceId) {
      const invoice = invoices.find(inv => inv.id === invoiceId);
      if (!invoice) throw new Error('Không tìm thấy hoá đơn để xoá.');

      const currentRawBatches = this.load<Batch[]>(BASE_KEYS.BATCHES, []);
      const currentRecalculated = this.rebuildBatchesAndExportCogs(invoices, currentRawBatches);
      const currentMap = buildStockMap(currentRecalculated.batches);

      const nextInvoices = invoices.filter(inv => inv.id !== invoice.id);
      let sourceBatches = [...currentRawBatches];
      if (invoice.type === 'IMPORT') {
        sourceBatches = sourceBatches.filter(batch => !(batch.code || '').startsWith(`${invoice.code}-B`));
      }
      const recalculated = this.rebuildBatchesAndExportCogs(nextInvoices, sourceBatches);
      const afterMap = buildStockMap(recalculated.batches);
      const stockImpactDetails = buildDetailDiff(currentMap, afterMap);
      const stockSummary = summarizeDetails(stockImpactDetails);

      const linkedCash = cashTxns.filter(txn => txn.refId === invoiceId);
      const cashDelta = linkedCash.reduce((sum, txn) => {
        if (txn.type === TransactionType.INCOME) return sum - (Number(txn.amount) || 0);
        if (txn.type === TransactionType.EXPENSE) return sum + (Number(txn.amount) || 0);
        return sum;
      }, 0);

      const partnerDebtDelta = invoice.type === 'EXPORT' ? -(Number(invoice.debtAmount) || 0) : 0;

      return {
        targetType: 'INVOICE' as const,
        invoice,
        linkedCash,
        stockImpactDetails,
        impactSummary: {
          stockIncreaseCon: stockSummary.stockIncreaseCon,
          stockDecreaseCon: stockSummary.stockDecreaseCon,
          stockIncreaseKg: stockSummary.stockIncreaseKg,
          stockDecreaseKg: stockSummary.stockDecreaseKg,
          partnerDebtDelta,
          cashDelta,
        }
      };
    }

    if (cashTransactionId) {
      const txn = cashTxns.find(item => item.id === cashTransactionId);
      if (!txn) throw new Error('Không tìm thấy giao dịch tiền để xoá.');
      const cashDelta = txn.type === TransactionType.INCOME ? -(Number(txn.amount) || 0) : (Number(txn.amount) || 0);
      return {
        targetType: 'CASH_TXN' as const,
        cashTransaction: txn,
        stockImpactDetails: [],
        impactSummary: {
          stockIncreaseCon: 0,
          stockDecreaseCon: 0,
          stockIncreaseKg: 0,
          stockDecreaseKg: 0,
          partnerDebtDelta: 0,
          cashDelta,
        }
      };
    }

    throw new Error('Thiếu thông tin giao dịch cần xoá.');
  }

  async deleteTransactionHistory(params: { invoiceId?: string; cashTransactionId?: string; reason: string }) {
    const reason = (params.reason || '').trim();
    if (!reason) throw new Error('Vui lòng nhập lý do xoá giao dịch.');

    const preview = this.getDeleteTransactionImpact({ invoiceId: params.invoiceId, cashTransactionId: params.cashTransactionId });
    const logs = this.getDeletedTransactionHistories();

    if (preview.targetType === 'INVOICE') {
      const invoice = preview.invoice;
      const invoices = this.getInvoices().filter(inv => inv.id !== invoice.id);
      const cashTxns = this.getCashTransactions().filter(txn => txn.refId !== invoice.id);

      let batches = this.load<Batch[]>(BASE_KEYS.BATCHES, []);
      if (invoice.type === 'IMPORT') {
        batches = batches.filter(batch => !(batch.code || '').startsWith(`${invoice.code}-B`));
      }

      const recalculated = this.rebuildBatchesAndExportCogs(invoices, batches);
      const invoicesWithCogs = invoices.map(inv => inv.type === 'EXPORT'
        ? { ...inv, cogs: recalculated.cogsByInvoice[inv.id] || 0 }
        : inv
      );

      const partners = this.getPartners();
      if (invoice.type === 'EXPORT') {
        const customer = partners.find(p => p.id === invoice.partnerId);
        if (customer) {
          customer.debt = Math.max(0, (Number(customer.debt) || 0) - (Number(invoice.debtAmount) || 0));
        }
      }

      const deletedLog: DeletedTransactionHistory = {
        id: `del-${Date.now()}-${invoice.id}`,
        deletedAt: new Date().toISOString(),
        reason,
        type: 'INVOICE',
        invoiceId: invoice.id,
        invoiceCode: invoice.code,
        snapshot: { invoice: { ...invoice } },
        impactSummary: preview.impactSummary,
        stockImpactDetails: preview.stockImpactDetails,
      };

      this.save(BASE_KEYS.BATCHES, batches);
      this.save(BASE_KEYS.INVOICES, invoicesWithCogs);
      this.save(BASE_KEYS.CASH, cashTxns);
      this.save(BASE_KEYS.PARTNERS, partners);
      this.save(BASE_KEYS.DELETED_TXN_HISTORY, [deletedLog, ...logs].slice(0, 2000));

      await delay(150);
      return deletedLog;
    }

    const txn = preview.cashTransaction;
    if (!txn) throw new Error('Không tìm thấy giao dịch tiền để xoá.');

    const cashTxns = this.getCashTransactions().filter(item => item.id !== txn.id);
    const deletedLog: DeletedTransactionHistory = {
      id: `del-${Date.now()}-${txn.id}`,
      deletedAt: new Date().toISOString(),
      reason,
      type: 'CASH_TXN',
      cashTransactionId: txn.id,
      snapshot: { cashTransaction: { ...txn } },
      impactSummary: preview.impactSummary,
      stockImpactDetails: preview.stockImpactDetails,
    };

    this.save(BASE_KEYS.CASH, cashTxns);
    this.save(BASE_KEYS.DELETED_TXN_HISTORY, [deletedLog, ...logs].slice(0, 2000));

    await delay(120);
    return deletedLog;
  }

  getDashboardStats(): DashboardStats {
    const today = new Date().toISOString().split('T')[0];
    const invoices = this.getInvoices();
    const partners = this.getPartners();
    const cashTxns = this.getCashTransactions();

    // 1. DOANH THU BÁN HÀNG (Sales Revenue) - Quan trọng: Tính cả nợ
    // Lấy tất cả hóa đơn xuất (EXPORT) trong ngày
    const todayExportInvoices = invoices.filter(i => i.date === today && i.type === 'EXPORT');
    const salesRevenueToday = todayExportInvoices.reduce((sum, i) => sum + i.totalAmount, 0);

    // 2. GIÁ VỐN HÀNG BÁN (COGS)
    // Code của bạn đã tính sẵn cogs trong createSale (rất tốt), chỉ cần cộng lại
    const realizedCogsToday = todayExportInvoices.reduce((sum, i) => sum + (i.cogs || 0), 0);
    
    // 3. CHI PHÍ VẬN HÀNH (Operating Expenses)
    // Là các khoản CHI không phải trả tiền nhập hàng (ví dụ: mua túi bóng, xăng xe, ăn uống...)
    // Logic: Lấy transaction loại EXPENSE trong ngày, và KHÔNG có refId (vì nhập hàng có refId trỏ về Invoice)
    const operatingExpensesToday = cashTxns
        .filter(t => t.date.startsWith(today) && t.type === TransactionType.EXPENSE && !t.refId)
        .reduce((sum, t) => sum + t.amount, 0);

    // 4. LỢI NHUẬN RÒNG (Net Profit)
    const profitToday = salesRevenueToday - realizedCogsToday - operatingExpensesToday;

    // --- CÁC CHỈ SỐ KHÁC (GIỮ NGUYÊN HOẶC TINH CHỈNH) ---
    
    // Tổng nợ phải thu
    const receivables = partners.filter(p => p.type === PartnerType.CUSTOMER).reduce((sum, p) => sum + p.debt, 0);
    
    // Vốn nhập hàng tích lũy
    const importCapital = invoices.filter(i => i.type === 'IMPORT').reduce((sum, i) => sum + i.totalAmount, 0);
    
    // Nhập hàng hôm nay
    const todayImportInvoices = invoices.filter(i => i.date === today && i.type === 'IMPORT');
    const importToday = todayImportInvoices.reduce((sum, i) => sum + i.totalAmount, 0);

    // Lưu ý: revenueToday ở Dashboard hiển thị, bạn có thể chọn hiển thị "Doanh số bán" hoặc "Thực thu". 
    // Ở đây tôi đề xuất hiển thị "Doanh số bán" (Sales Revenue) để khớp với Lợi nhuận.
    return {
        revenueToday: salesRevenueToday, // Đã đổi từ tiền mặt sang doanh số
        profitToday, 
        receivables, 
        importCapital, 
        importToday,
        otherExpenseToday: operatingExpensesToday,
        totalExpenseToday: importToday + operatingExpensesToday
    };
  }

  async createOtherExpense(amount: number, category: string, note?: string, dateTime?: string) {
    if (!amount || amount <= 0) throw new Error("Số tiền chi không hợp lệ");

    const cashTxns = this.getCashTransactions();
    const ts = dateTime || new Date().toISOString();

    const newTxn: CashTransaction = {
      id: `txn-exp-${Date.now()}`,
      date: ts,
      type: TransactionType.EXPENSE,
      amount,
      description: note ? `Chi ${category}: ${note}` : `Chi ${category}`,
    };

    this.save(BASE_KEYS.CASH, [newTxn, ...cashTxns]);
    await delay(150);
    return newTxn;
  }

  // --- TÍNH NĂNG MỚI: THANH TOÁN NỢ ---
  async settleDebt(partnerId: string, amount: number, note?: string) {
    const partners = this.getPartners();
    const partner = partners.find(p => p.id === partnerId);
    if (!partner) throw new Error("Không tìm thấy khách hàng");
    if (amount <= 0) throw new Error("Số tiền trả phải lớn hơn 0");

    // 1. Tạo giao dịch thu tiền (Sẽ tự động làm tăng Doanh thu/Lợi nhuận ở Dashboard)
    const cashTxns = this.getCashTransactions();
    const txnId = `txn-debt-${Date.now()}`;
    const newTxn: CashTransaction = {
      id: txnId,
      date: new Date().toISOString(),
      type: TransactionType.INCOME,
      amount: amount,
      description: note || `Thu nợ khách: ${partner.name}`,
    };
    this.save(BASE_KEYS.CASH, [newTxn, ...cashTxns]);

    // 2. Trừ nợ tổng của khách hàng
    partner.debt = Math.max(0, partner.debt - amount);
    this.save(BASE_KEYS.PARTNERS, partners);

    // 3. Cập nhật trạng thái các hóa đơn nợ chi tiết (FIFO - Trừ hóa đơn cũ trước)
    const allInvoices = this.getInvoices();
    const unpaidInvoices = allInvoices
      .filter(i => i.partnerId === partnerId && i.type === 'EXPORT' && i.debtAmount > 0)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let remainingPay = amount;

    for (const inv of unpaidInvoices) {
      if (remainingPay <= 0) break;

      const payForThisInvoice = Math.min(inv.debtAmount, remainingPay);
      
      inv.paidAmount = (Number(inv.paidAmount) || 0) + payForThisInvoice;
      inv.debtAmount -= payForThisInvoice;
      
      // Cập nhật paymentMethod nếu trả hết
      if (inv.debtAmount <= 0) {
        inv.paymentMethod = PaymentMethod.CASH;
      } else {
        inv.paymentMethod = PaymentMethod.DEBT;
      }

      remainingPay -= payForThisInvoice;
    }

    // Lưu lại danh sách hóa đơn đã cập nhật
    this.save(BASE_KEYS.INVOICES, allInvoices);

    await delay(300);
    return true;
  }

  // --- HÀM MỚI: TẠO ĐIỀU CHỈNH KHO NHANH ---
  async createDirectAdjustment(productId: string, gender: string, qtyKg: number, qtyCon: number) {
    const products = this.getProducts();
    const product = products.find(p => p.id === productId);

    this.appendStockMovements([
      {
        id: `stk-manual-${Date.now()}-${productId}-${gender}`,
        occurredAt: new Date().toISOString(),
        productId,
        productName: product?.name || 'Không rõ sản phẩm',
        gender: gender as Gender,
        source: 'MANUAL_EDIT',
        deltaKg: qtyKg,
        deltaCon: qtyCon,
        note: 'Điều chỉnh tồn kho theo loại gà',
      }
    ]);
    await delay(200);
    return true;
  }
}

export const db = new Database();