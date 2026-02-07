import { createClient } from '@supabase/supabase-js';
import { Batch, BankSettings, CashTransaction, DashboardStats, Invoice, InvoiceLine, Partner, PartnerType, PaymentMethod, Product, TransactionType, Unit, PreOrder } from '../types';

// --- CẤU HÌNH SUPABASE ---
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("⚠️ CHƯA CẤU HÌNH SUPABASE: Hãy kiểm tra file .env.local");
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// --- DỮ LIỆU MẪU (SEED DATA) ---
const SEED_PRODUCTS: Product[] = [
  { id: 'p1', name: 'Gà Ta Thả Vườn', defaultPrice: 110000, standardCost: 85000 },
  { id: 'p2', name: 'Gà Ri Lai', defaultPrice: 95000, standardCost: 70000 },
  { id: 'p3', name: 'Gà Công Nghiệp', defaultPrice: 65000, standardCost: 45000 },
];

const SEED_PARTNERS: Partner[] = [
  { id: 's1', name: 'Trại Gà Ba Vì', phone: '0901234567', type: PartnerType.SUPPLIER, debt: 0 },
  { id: 'c1', name: 'Khách Lẻ', phone: '', type: PartnerType.CUSTOMER, debt: 0 },
];

const BASE_KEYS = {
  PRODUCTS: 'products',
  PARTNERS: 'partners',
  BATCHES: 'batches',
  INVOICES: 'invoices',
  CASH: 'cash',
  BANK: 'bank',
  PREORDERS: 'preorders',
  START_DATE: 'start_date',
};

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

class Database {
  private businessId: string = '';
  // Bộ nhớ đệm (Cache) để App chạy nhanh, không phải chờ mạng mỗi lần bấm
  private cache: Record<string, any> = {}; 

  constructor() {
    const savedId = localStorage.getItem('gttd_current_business_id');
    if (savedId) this.businessId = savedId;
  }

  // --- HÀM QUAN TRỌNG: KẾT NỐI & TẢI DỮ LIỆU ---
  async init(businessCode: string) {
    this.businessId = businessCode;
    localStorage.setItem('gttd_current_business_id', businessCode);
    console.log(`📡 Đang tải dữ liệu cho shop: ${businessCode}...`);

    // 1. Tải toàn bộ dữ liệu từ Supabase về Cache
    const keys = Object.values(BASE_KEYS).map(k => `${businessCode}_${k}`);
    const { data, error } = await supabase
      .from('app_storage')
      .select('key, value')
      .in('key', keys);

    if (error) console.error("Lỗi tải data:", error);

    // 2. Đổ dữ liệu vào RAM (Cache)
    if (data && data.length > 0) {
      data.forEach(row => {
        this.cache[row.key] = row.value;
        // Backup vào LocalStorage phòng khi mất mạng
        localStorage.setItem(row.key, JSON.stringify(row.value));
      });
      console.log("✅ Đã đồng bộ dữ liệu xong!");
    } else {
      console.log("⚠️ Shop mới, chưa có dữ liệu trên mây. Dùng dữ liệu Local.");
      // Nếu trên mây chưa có, thử lấy từ LocalStorage
      Object.values(BASE_KEYS).forEach(k => {
        const key = this.k(k);
        const local = localStorage.getItem(key);
        if (local) this.cache[key] = JSON.parse(local);
      });
    }
  }

  private k(key: string): string {
    if (!this.businessId) return `temp_${key}`;
    return `${this.businessId}_${key}`;
  }

  // Hàm load: Đọc từ RAM (Siêu nhanh)
  private load<T>(key: string, defaultVal: T): T {
    const fullKey = this.k(key);
    // Ưu tiên đọc từ RAM
    if (this.cache[fullKey] !== undefined) {
      return this.cache[fullKey] as T;
    }
    // Không có thì trả về default
    return defaultVal;
  }

  // Hàm save: Lưu RAM -> Lưu Local -> Gửi lên Supabase (Bất đồng bộ)
  private save(key: string, data: any) {
    const fullKey = this.k(key);
    
    // 1. Cập nhật RAM ngay lập tức (để UI update)
    this.cache[fullKey] = data;

    // 2. Lưu LocalStorage (Backup offline)
    localStorage.setItem(fullKey, JSON.stringify(data));

    // 3. Gửi lên Supabase (Chạy ngầm, không bắt App chờ)
    supabase
      .from('app_storage')
      .upsert({ key: fullKey, value: data })
      .then(({ error }) => {
        if (error) console.error(`❌ Lỗi lưu ${key}:`, error.message);
        else console.log(`☁️ Đã lưu ${key} lên mây`);
      });
  }

  // --- BỔ SUNG CÁC HÀM BỊ THIẾU (FIX LỖI) ---
  
  checkBusinessExists(id: string): boolean {
    // Kiểm tra xem đã có dữ liệu products của shop này chưa
    return localStorage.getItem(`${id}_products`) !== null;
  }

  setBusinessId(id: string) {
    this.businessId = id;
    localStorage.setItem('gttd_current_business_id', id);
  }

  initStartDate() {
    const key = this.k(BASE_KEYS.START_DATE);
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, new Date().toISOString().split('T')[0]);
    }
  }

  getStartDate(): string {
    const key = this.k(BASE_KEYS.START_DATE);
    return localStorage.getItem(key) || new Date().toISOString().split('T')[0];
  }

  // --- GIỮ NGUYÊN TOÀN BỘ LOGIC TÍNH TOÁN CŨ DƯỚI ĐÂY ---
  // (Chỉ thay đổi cơ chế load/save ở trên, logic dưới này y hệt file cũ của bạn)

  getProducts(): Product[] {
    let products = this.load<Product[]>(BASE_KEYS.PRODUCTS, []);
    if (products.length === 0) {
        products = SEED_PRODUCTS; // Load seed nếu rỗng
        this.save(BASE_KEYS.PRODUCTS, products);
    }
    return products;
  }

  getPartners(type?: PartnerType): Partner[] {
    let partners = this.load<Partner[]>(BASE_KEYS.PARTNERS, []);
    if (partners.length === 0) {
        partners = SEED_PARTNERS;
        this.save(BASE_KEYS.PARTNERS, partners);
    }
    if (type) return partners.filter(p => p.type === type);
    return partners;
  }

  getBatches(productId?: string): Batch[] {
    const batches = this.load<Batch[]>(BASE_KEYS.BATCHES, []);
    const sorted = batches.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return productId ? sorted.filter(b => b.productId === productId && b.status === 'OPEN') : sorted;
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

  getPreOrders(): PreOrder[] {
    return this.load<PreOrder[]>(BASE_KEYS.PREORDERS, []).sort((a, b) => new Date(a.deliveryTime).getTime() - new Date(b.deliveryTime).getTime());
  }

  // --- CRUD FUNCTIONS (WRITE) ---

  saveBankSettings(settings: BankSettings) {
    this.save(BASE_KEYS.BANK, settings);
  }

  saveProduct(product: Product) {
    const products = this.getProducts();
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

  deletePreOrder(id: string) {
    const list = this.getPreOrders();
    this.save(BASE_KEYS.PREORDERS, list.filter(p => p.id !== id));
  }

  updateBatch(id: string, updates: Partial<Batch>) {
    const batches = this.getBatches();
    const index = batches.findIndex(b => b.id === id);
    if (index >= 0) {
      batches[index] = { ...batches[index], ...updates };
      if (batches[index].qtyRemKg <= 0.1 && batches[index].qtyRemCon <= 0) {
        batches[index].status = 'CLOSED';
      } else {
        batches[index].status = 'OPEN';
      }
      this.save(BASE_KEYS.BATCHES, batches);
    }
  }

  // --- LOGIC GIAO DỊCH (ASYNC) ---
  // Lưu ý: Các hàm này vẫn giữ async để UI hiển thị loading

  async createPurchase(
    supplierId: string,
    date: string,
    lines: { productId: string; qtyCon: number; qtyKg: number; price: number }[],
    extraCost: number,
    paidAmount: number 
  ) {
    const products = this.getProducts();
    const partners = this.getPartners();
    const batches = this.getBatches(); // Load all batches (raw)
    const invoices = this.getInvoices();
    const cash = this.getCashTransactions();

    const supplier = partners.find(p => p.id === supplierId);
    if (!supplier) throw new Error("Supplier not found");

    const code = `IN-${date.replace(/-/g, '')}-${invoices.length + 1}`;
    let totalGoods = 0;
    const invoiceLines: InvoiceLine[] = [];
    lines.forEach(l => { totalGoods += l.qtyKg * l.price; });

    const newBatches: Batch[] = lines.map((l, idx) => {
      const lineTotal = l.qtyKg * l.price;
      const ratio = totalGoods > 0 ? lineTotal / totalGoods : 0;
      const allocatedExtra = extraCost * ratio;
      const totalBatchCost = lineTotal + allocatedExtra;
      
      const prod = products.find(p => p.id === l.productId);
      if (prod) prod.standardCost = l.price; // Update standard cost

      invoiceLines.push({
        productId: l.productId,
        productName: prod ? prod.name : 'Unknown',
        qtyCon: l.qtyCon,
        qtyKg: l.qtyKg,
        unit: Unit.KG,
        price: l.price,
        amount: lineTotal
      });

      return {
        id: `batch-${Date.now()}-${idx}`,
        code: `${code}-B${idx+1}`,
        productId: l.productId,
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

    this.save(BASE_KEYS.PRODUCTS, products);
    const totalAmount = totalGoods + extraCost;
    
    const invoice: Invoice = {
      id: `inv-${Date.now()}`,
      code,
      type: 'IMPORT',
      date,
      partnerId: supplierId,
      partnerName: supplier.name,
      totalAmount,
      paidAmount: totalAmount, // Vốn nhập coi như trả hết
      debtAmount: 0,
      lines: invoiceLines
    };

    // Save all changes
    this.save(BASE_KEYS.BATCHES, [...batches, ...newBatches]);
    this.save(BASE_KEYS.INVOICES, [invoice, ...invoices]);
    
    const txn: CashTransaction = {
      id: `txn-${Date.now()}`,
      date: new Date().toISOString(),
      type: TransactionType.EXPENSE,
      amount: totalAmount,
      description: `Vốn nhập hàng: ${supplier.name}`,
      refId: invoice.id
    };
    this.save(BASE_KEYS.CASH, [txn, ...cash]);

    await delay(300); 
    return invoice;
  }

  async createSale(
    customerId: string,
    date: string,
    lines: { productId: string; productName?: string; qtyCon: number; qtyKg: number; price: number; unit: Unit }[],
    paidAmount: number
  ) {
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

    for (const line of lines) {
      const lineAmount = (line.unit === Unit.KG ? line.qtyKg : line.qtyCon) * line.price;
      totalAmount += lineAmount;

      if (line.productId === 'MANUAL') {
        invoiceLines.push({
            productId: 'MANUAL',
            productName: line.productName || 'Hàng ngoài',
            qtyCon: line.qtyCon,
            qtyKg: line.qtyKg,
            unit: line.unit,
            price: line.price,
            amount: lineAmount
        });
        continue;
      }

      const prod = products.find(p => p.id === line.productId)!;
      invoiceLines.push({
        productId: line.productId,
        productName: prod.name,
        qtyCon: line.qtyCon,
        qtyKg: line.qtyKg,
        unit: line.unit,
        price: line.price,
        amount: lineAmount
      });

      // FIFO Logic
      let remainingKgToDeduct = line.qtyKg;
      let remainingConToDeduct = line.qtyCon;
      
      const productBatches = batches
        .filter(b => b.productId === line.productId && b.status === 'OPEN')
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      if (productBatches.length === 0) {
         const estCogs = prod.standardCost ? (line.qtyKg > 0 ? line.qtyKg * prod.standardCost : 0) : 0;
         totalCOGS += estCogs;
      }

      for (const batch of productBatches) {
        if (remainingKgToDeduct <= 0 && remainingConToDeduct <= 0) break;

        const takeKg = Math.min(batch.qtyRemKg, remainingKgToDeduct);
        const takeCon = Math.min(batch.qtyRemCon, remainingConToDeduct);

        if (takeKg > 0 || takeCon > 0) {
          totalCOGS += takeKg * batch.costPerKg;
          batch.qtyRemKg -= takeKg;
          batch.qtyRemCon -= takeCon;
          remainingKgToDeduct -= takeKg;
          remainingConToDeduct -= takeCon;

          if (batch.qtyRemKg <= 0.1 && batch.qtyRemCon <= 0) batch.status = 'CLOSED';
        }
      }
    }

    const debtAmount = totalAmount - paidAmount;
    const invoice: Invoice = {
      id: `inv-${Date.now()}`,
      code,
      type: 'EXPORT',
      date,
      partnerId: customerId,
      partnerName: customer.name,
      totalAmount,
      paidAmount,
      debtAmount,
      lines: invoiceLines,
      paymentMethod: debtAmount === totalAmount ? PaymentMethod.DEBT : (paidAmount > 0 ? PaymentMethod.CASH : undefined), 
      cogs: totalCOGS
    };

    this.save(BASE_KEYS.BATCHES, batches);
    this.save(BASE_KEYS.INVOICES, [invoice, ...invoices]);

    if (paidAmount > 0) {
      const txn: CashTransaction = {
        id: `txn-${Date.now()}`,
        date: new Date().toISOString(),
        type: TransactionType.INCOME,
        amount: paidAmount,
        description: `Thu bán hàng: ${customer.name}`,
        refId: invoice.id
      };
      this.save(BASE_KEYS.CASH, [txn, ...cash]);
    }

    customer.debt += debtAmount;
    this.save(BASE_KEYS.PARTNERS, partners);

    await delay(300);
    return invoice;
  }

  getDashboardStats(): DashboardStats {
    const today = new Date().toISOString().split('T')[0];
    const invoices = this.getInvoices();
    const partners = this.getPartners();

    const todayExportInvoices = invoices.filter(i => i.date === today && i.type === 'EXPORT');
    const todayImportInvoices = invoices.filter(i => i.date === today && i.type === 'IMPORT');
    
    const revenueToday = todayExportInvoices.reduce((sum, i) => sum + i.paidAmount, 0);
    const realizedCogsToday = todayExportInvoices.reduce((sum, i) => {
        const ratio = i.totalAmount > 0 ? i.paidAmount / i.totalAmount : 0;
        return sum + ((i.cogs || 0) * ratio);
    }, 0);
    
    const profitToday = revenueToday - realizedCogsToday;
    const receivables = partners.filter(p => p.type === PartnerType.CUSTOMER).reduce((sum, p) => sum + p.debt, 0);
    const importCapital = invoices.filter(i => i.type === 'IMPORT').reduce((sum, i) => sum + i.totalAmount, 0);
    const importToday = todayImportInvoices.reduce((sum, i) => sum + i.totalAmount, 0);

    return { revenueToday, profitToday, receivables, importCapital, importToday };
  }
}

export const db = new Database();