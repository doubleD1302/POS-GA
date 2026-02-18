import { createClient } from '@supabase/supabase-js';
import { Batch, BankSettings, CashTransaction, DashboardStats, Invoice, InvoiceLine, Partner, PartnerType, PaymentMethod, Product, TransactionType, Unit, PreOrder, Gender, StockMovement } from '../types';

// --- CẤU HÌNH SUPABASE ---
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("⚠️ CHƯA CẤU HÌNH SUPABASE: Hãy kiểm tra file .env.local");
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// --- DỮ LIỆU MẪU (SEED DATA) ---
const SEED_PRODUCTS: Product[] = [
  { id: 'p1', name: 'Gà Ta Thả Vườn', priceMale: 110000, priceFemale: 90000, costMale: 85000, costFemale: 70000 },
  { id: 'p2', name: 'Gà Ri Lai', priceMale: 95000, priceFemale: 85000, costMale: 70000, costFemale: 60000 },
]

const SEED_PARTNERS: Partner[] = [
  { id: 's1', name: 'Trại Gà Ba Vì', phone: '0901234567', type: PartnerType.SUPPLIER, supplierCategory: 'FARM', debt: 0 },
  { id: 'c1', name: 'Khách Lẻ', phone: '', type: PartnerType.CUSTOMER, debt: 0 },
];

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
    let products = this.load<Product[]>(BASE_KEYS.PRODUCTS, []);
    if (products.length === 0) {
        // Chỉ save seed data nếu thực sự chưa có gì (tránh ghi đè khi mạng lag)
        // Logic ở đây: Trả về seed để hiển thị, nhưng chờ người dùng tương tác mới save
        return SEED_PRODUCTS; 
    }
    return products;
  }
  
  // Hàm này để init lần đầu cho shop mới
  async seedNewBusiness() {
      console.log("🌱 Đang khởi tạo dữ liệu mẫu lên Cloud...");
      // Dùng Promise.all để lưu 3 cái cùng lúc cho nhanh
      await Promise.all([
        this.save(BASE_KEYS.PRODUCTS, SEED_PRODUCTS),
        this.save(BASE_KEYS.PARTNERS, SEED_PARTNERS),
        this.save(BASE_KEYS.START_DATE, new Date().toISOString().split('T')[0])
      ]);
      console.log("✅ Đã khởi tạo xong dữ liệu mẫu!");
  }

  getPartners(type?: PartnerType): Partner[] {
    let partners = this.load<Partner[]>(BASE_KEYS.PARTNERS, []);
    if (partners.length === 0 && !this.checkBusinessExists(this.businessId)) {
        return SEED_PARTNERS;
    }
    if (type) return partners.filter(p => p.type === type);
    return partners;
  }

  getBatches(productId?: string): Batch[] {
    const batches = this.load<Batch[]>(BASE_KEYS.BATCHES, []);
    const sorted = batches.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return productId ? sorted.filter(b => b.productId === productId && b.status === 'OPEN') : sorted;
  }

  getStockMovements(limit?: number): StockMovement[] {
    const movements = this.load<StockMovement[]>(BASE_KEYS.STOCK_MOVEMENTS, [])
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
    return limit ? movements.slice(0, limit) : movements;
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
    const history = this.load<StockMovement[]>(BASE_KEYS.STOCK_MOVEMENTS, []);
    this.save(BASE_KEYS.STOCK_MOVEMENTS, [...entries, ...history].slice(0, 2000));
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
    const batches = this.getBatches();
    const index = batches.findIndex(b => b.id === id);
    if (index >= 0) {
      const previousBatch = { ...batches[index] };
      const updatedBatch = { ...batches[index], ...updates };
      if (updatedBatch.qtyRemKg <= 0.1 && updatedBatch.qtyRemCon <= 0) {
        updatedBatch.status = 'CLOSED';
      } else {
        updatedBatch.status = 'OPEN';
      }

      batches[index] = updatedBatch;
      this.save(BASE_KEYS.BATCHES, batches);

      const deltaKg = (Number(updatedBatch.qtyRemKg) || 0) - (Number(previousBatch.qtyRemKg) || 0);
      const deltaCon = (Number(updatedBatch.qtyRemCon) || 0) - (Number(previousBatch.qtyRemCon) || 0);
      if (Math.abs(deltaKg) > 0.0001 || Math.abs(deltaCon) > 0.0001) {
        const products = this.getProducts();
        const product = products.find(p => p.id === updatedBatch.productId);
        this.appendStockMovements([
          {
            id: `stk-${Date.now()}-${updatedBatch.id}`,
            occurredAt: new Date().toISOString(),
            productId: updatedBatch.productId,
            productName: product?.name || 'Không rõ sản phẩm',
            gender: updatedBatch.gender,
            batchId: updatedBatch.id,
            source: 'MANUAL_EDIT',
            deltaKg,
            deltaCon,
            afterKg: updatedBatch.qtyRemKg,
            afterCon: updatedBatch.qtyRemCon,
            note: 'Sửa tồn kho thủ công',
          }
        ]);
      }
    }
  }

  // --- TRANSACTION LOGIC ---
  async createPurchase(supplierId: string, date: string, lines: any[], extraCost: number, paidAmount: number) {
    const products = this.getProducts();
    const partners = this.getPartners();
    const batches = this.getBatches(); 
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
    const batches = this.getBatches();
    
    // Tạo mã lô hàng đặc biệt
    const code = `ADJ-${date.replace(/-/g, '')}-${Date.now().toString().slice(-4)}`;

    const newBatches: Batch[] = lines.map((l, idx) => {
      const lineTotal = l.qtyKg * l.price;
      
      // Cập nhật giá vốn nhập mới nhất cho sản phẩm (để lần sau nhập tiếp gợi ý giá này)
      const prod = products.find(p => p.id === l.productId);
      if (prod) {
        if (l.gender === 'MALE') prod.costMale = l.price;
        else prod.costFemale = l.price;
      }

      return {
        id: `batch-adj-${Date.now()}-${idx}`,
        code: `${code}-B${idx+1}`,
        productId: l.productId,
        gender: l.gender || 'MALE',
        supplierId: 'INTERNAL',       // Đánh dấu là nội bộ
        supplierName: 'KHO NỘI BỘ',   // Tên hiển thị
        date,
        qtyInCon: l.qtyCon,
        qtyInKg: l.qtyKg,
        qtyRemCon: l.qtyCon, // Tồn ban đầu = nhập
        qtyRemKg: l.qtyKg,
        baseCost: lineTotal,
        extraCost: 0,        // Kiểm tồn thường không có phí vận chuyển
        totalCost: lineTotal,
        costPerKg: l.qtyKg > 0 ? lineTotal / l.qtyKg : 0,
        costPerCon: l.qtyCon > 0 ? lineTotal / l.qtyCon : 0,
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
        source: 'ADJUSTMENT',
        deltaKg: batch.qtyInKg,
        deltaCon: batch.qtyInCon,
        afterKg: batch.qtyRemKg,
        afterCon: batch.qtyRemCon,
        note: 'Tạo tồn kho/kiểm kho ban đầu',
      };
    });

    // Chỉ lưu Batch và Update giá sản phẩm
    this.save(BASE_KEYS.PRODUCTS, products);
    this.save(BASE_KEYS.BATCHES, [...batches, ...newBatches]);
    this.appendStockMovements(stockMovements);

    await delay(300);
    return true;
  }

  async createSale(customerId: string, date: string, lines: any[], paidAmount: number, paymentMethod?: PaymentMethod) {
    const partners = this.getPartners();
    const batches = this.load<Batch[]>(BASE_KEYS.BATCHES, []);
    const invoices = this.getInvoices();
    const cash = this.getCashTransactions();
    const products = this.getProducts();

    const customer = partners.find(p => p.id === customerId);
    if (!customer) throw new Error("Customer not found");

    const code = `OUT-${date.replace(/-/g, '')}-${invoices.filter(i => i.type === 'EXPORT').length + 1}`;
    let totalAmount = 0;
    let totalCOGS = 0;
    const invoiceLines: InvoiceLine[] = [];
    const stockMovements: StockMovement[] = [];

    for (const line of lines) {
      const lineAmount = (line.unit === Unit.KG ? line.qtyKg : line.qtyCon) * line.price;
      totalAmount += lineAmount;

      if (line.productId === 'MANUAL') {
        invoiceLines.push({ productId: 'MANUAL', productName: line.productName || 'Hàng ngoài', qtyCon: line.qtyCon, qtyKg: line.qtyKg, unit: line.unit, price: line.price, amount: lineAmount, gender: line.gender || 'MALE' });
        continue;
      }

      const prod = products.find(p => p.id === line.productId)!;
      invoiceLines.push({ productId: line.productId, productName: prod.name, qtyCon: line.qtyCon, qtyKg: line.qtyKg, unit: line.unit, price: line.price, amount: lineAmount, gender: line.gender || 'MALE' });

      let remainingKgToDeduct = line.qtyKg;
      let remainingConToDeduct = line.qtyCon;
      
      // Mặc định là MALE nếu không có giới tính
      const targetGender = line.gender || 'MALE';
      
      const productBatches = batches
        .filter(b => b.productId === line.productId && b.status === 'OPEN' && b.gender === targetGender)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      if (productBatches.length === 0) {
         const avgCost = targetGender === 'MALE' ? prod.costMale : prod.costFemale;
         const estCogs = avgCost ? (line.qtyKg > 0 ? line.qtyKg * avgCost : 0) : 0;
         totalCOGS += estCogs;
      }

      for (const batch of productBatches) {
        if (remainingKgToDeduct <= 0 && remainingConToDeduct <= 0) break;
        const takeKg = Math.min(batch.qtyRemKg, remainingKgToDeduct);
        const takeCon = Math.min(batch.qtyRemCon, remainingConToDeduct);

        if (takeKg > 0 || takeCon > 0) {
          totalCOGS += takeKg * batch.costPerKg;
          batch.qtyRemKg -= takeKg; batch.qtyRemCon -= takeCon;
          remainingKgToDeduct -= takeKg; remainingConToDeduct -= takeCon;
          if (batch.qtyRemKg <= 0.1 && batch.qtyRemCon <= 0) batch.status = 'CLOSED';

          stockMovements.push({
            id: `stk-${Date.now()}-${batch.id}-${stockMovements.length}`,
            occurredAt: new Date().toISOString(),
            productId: line.productId,
            productName: prod.name,
            gender: targetGender,
            batchId: batch.id,
            source: 'SALE',
            deltaKg: -takeKg,
            deltaCon: -takeCon,
            afterKg: batch.qtyRemKg,
            afterCon: batch.qtyRemCon,
            note: `Xuất bán ${customer.name} (${code})`,
          });
        }
      }
    }

    const debtAmount = totalAmount - paidAmount;
    const finalPaymentMethod = paymentMethod || (debtAmount === totalAmount ? PaymentMethod.DEBT : (paidAmount > 0 ? PaymentMethod.CASH : undefined));
    const invoice: Invoice = {
      id: `inv-${Date.now()}`, code, type: 'EXPORT', date, partnerId: customerId, partnerName: customer.name,
      totalAmount, paidAmount, debtAmount, lines: invoiceLines, cogs: totalCOGS,
      paymentMethod: finalPaymentMethod,
    };

    this.save(BASE_KEYS.BATCHES, batches);
    this.appendStockMovements(stockMovements);
    this.save(BASE_KEYS.INVOICES, [invoice, ...invoices]);

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
      const price = Math.max(0, Number(line.price) || 0);
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
    this.save(BASE_KEYS.INVOICES, invoices);

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
    const batches = this.getBatches();
    const products = this.getProducts();
    const product = products.find(p => p.id === productId);
    
    const newBatch: Batch = {
      id: `adj-quick-${Date.now()}`,
      code: `ADJ-${new Date().toISOString().slice(0,10).replace(/-/g, '')}`,
      productId: productId,
      gender: gender as 'MALE' | 'FEMALE',
      supplierId: 'INTERNAL',       
      supplierName: 'ĐIỀU CHỈNH KHO', // Tên hiển thị khi sửa nhanh
      date: new Date().toISOString().split('T')[0],
      qtyInCon: qtyCon,
      qtyInKg: qtyKg,
      qtyRemCon: qtyCon, // Tồn = số vừa nhập
      qtyRemKg: qtyKg,
      baseCost: 0,        
      extraCost: 0,       
      totalCost: 0,
      costPerKg: 0,
      costPerCon: 0,
      status: 'OPEN'
    };

    // Lưu lô mới vào danh sách
    this.save(BASE_KEYS.BATCHES, [...batches, newBatch]);
    this.appendStockMovements([
      {
        id: `stk-${Date.now()}-${newBatch.id}`,
        occurredAt: new Date().toISOString(),
        productId,
        productName: product?.name || 'Không rõ sản phẩm',
        gender: newBatch.gender,
        batchId: newBatch.id,
        source: 'ADJUSTMENT',
        deltaKg: qtyKg,
        deltaCon: qtyCon,
        afterKg: newBatch.qtyRemKg,
        afterCon: newBatch.qtyRemCon,
        note: 'Điều chỉnh kho nhanh',
      }
    ]);
    await delay(200);
    return true;
  }
}

export const db = new Database();