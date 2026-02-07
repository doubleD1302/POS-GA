import { Batch, BankSettings, CashTransaction, DashboardStats, Invoice, InvoiceLine, Partner, PartnerType, PaymentMethod, PaymentStatus, Product, TransactionType, Unit, PreOrder } from '../types';

// Initial Seed Data
const SEED_PRODUCTS: Product[] = [
  { id: 'p1', name: 'Gà Ta Thả Vườn', defaultPrice: 110000, standardCost: 85000 },
  { id: 'p2', name: 'Gà Ri Lai', defaultPrice: 95000, standardCost: 70000 },
  { id: 'p3', name: 'Gà Công Nghiệp', defaultPrice: 65000, standardCost: 45000 },
];

const SEED_PARTNERS: Partner[] = [
  { id: 's1', name: 'Trại Gà Ba Vì', phone: '0901234567', type: PartnerType.SUPPLIER, debt: 0 },
  { id: 'c1', name: 'Khách Lẻ', phone: '', type: PartnerType.CUSTOMER, debt: 0 },
  { id: 'c2', name: 'Quán Cơm Bình Dân', phone: '0987654321', type: PartnerType.CUSTOMER, debt: 0 },
];

const BASE_KEYS = {
  PRODUCTS: 'products',
  PARTNERS: 'partners',
  BATCHES: 'batches',
  INVOICES: 'invoices',
  CASH: 'cash',
  BANK: 'bank',
  PREORDERS: 'preorders',
  START_DATE: 'start_date', // New key
};

// Helper to simulate delay
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

class Database {
  private businessId: string = '';

  constructor() {
    // Try to recover session if needed, though app handles login now
    const savedId = localStorage.getItem('gttd_current_business_id');
    if (savedId) this.businessId = savedId;
  }

  setBusinessId(id: string) {
    this.businessId = id;
    localStorage.setItem('gttd_current_business_id', id);
  }

  // Check if a business has data initialized
  checkBusinessExists(id: string): boolean {
    return localStorage.getItem(`${id}_${BASE_KEYS.PRODUCTS}`) !== null;
  }

  private k(key: string): string {
    if (!this.businessId) throw new Error("No Business ID set");
    return `${this.businessId}_${key}`;
  }

  private load<T>(key: string, defaultVal: T): T {
    const data = localStorage.getItem(this.k(key));
    return data ? JSON.parse(data) : defaultVal;
  }

  private save(key: string, data: any) {
    localStorage.setItem(this.k(key), JSON.stringify(data));
  }

  // --- START DATE LOGIC ---
  initStartDate() {
    const key = this.k(BASE_KEYS.START_DATE);
    const existing = localStorage.getItem(key);
    if (!existing) {
      // Set to today if not exists
      const today = new Date().toISOString().split('T')[0];
      localStorage.setItem(key, today);
    }
  }

  getStartDate(): string {
    const key = this.k(BASE_KEYS.START_DATE);
    return localStorage.getItem(key) || new Date().toISOString().split('T')[0];
  }

  // --- GETTERS ---
  getProducts(): Product[] {
    const raw = localStorage.getItem(this.k(BASE_KEYS.PRODUCTS));
    if (raw === null) {
      this.save(BASE_KEYS.PRODUCTS, SEED_PRODUCTS);
      return SEED_PRODUCTS;
    }
    return JSON.parse(raw);
  }

  getPartners(type?: PartnerType): Partner[] {
    const raw = localStorage.getItem(this.k(BASE_KEYS.PARTNERS));
    let partners: Partner[] = [];
    
    if (raw === null) {
      this.save(BASE_KEYS.PARTNERS, SEED_PARTNERS);
      partners = SEED_PARTNERS;
    } else {
      partners = JSON.parse(raw);
    }

    if (type) {
      return partners.filter(p => p.type === type);
    }
    return partners;
  }

  getBatches(productId?: string): Batch[] {
    const batches = this.load<Batch[]>(BASE_KEYS.BATCHES, []);
    // Sort by Date ASC for FIFO
    const sorted = batches.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return productId ? sorted.filter(b => b.productId === productId && b.status === 'OPEN') : sorted;
  }

  getInvoices(): Invoice[] {
    return this.load<Invoice[]>(BASE_KEYS.INVOICES, []).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  getInvoice(id: string): Invoice | undefined {
    const invoices = this.load<Invoice[]>(BASE_KEYS.INVOICES, []);
    return invoices.find(i => i.id === id);
  }

  getCashTransactions(): CashTransaction[] {
    // Sort by date DESC
    return this.load<CashTransaction[]>(BASE_KEYS.CASH, []).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  getBankSettings(): BankSettings | null {
    return this.load<BankSettings | null>(BASE_KEYS.BANK, null);
  }

  getPreOrders(): PreOrder[] {
    const list = this.load<PreOrder[]>(BASE_KEYS.PREORDERS, []);
    // Sort by Time ASC
    return list.sort((a, b) => new Date(a.deliveryTime).getTime() - new Date(b.deliveryTime).getTime());
  }

  // --- CRUD OPERATIONS ---

  saveBankSettings(settings: BankSettings) {
    this.save(BASE_KEYS.BANK, settings);
  }

  saveProduct(product: Product) {
    const products = this.getProducts();
    const index = products.findIndex(p => p.id === product.id);
    if (index >= 0) {
      products[index] = product;
    } else {
      products.push(product);
    }
    this.save(BASE_KEYS.PRODUCTS, products);
  }

  deleteProduct(id: string) {
    const products = this.getProducts();
    const newProducts = products.filter(p => p.id !== id);
    this.save(BASE_KEYS.PRODUCTS, newProducts);
  }

  savePartner(partner: Partner) {
    const partners = this.getPartners();
    const index = partners.findIndex(p => p.id === partner.id);
    if (index >= 0) {
      partners[index] = partner;
    } else {
      partners.push(partner);
    }
    this.save(BASE_KEYS.PARTNERS, partners);
  }

  deletePartner(id: string) {
    const partners = this.getPartners();
    const newPartners = partners.filter(p => p.id !== id);
    this.save(BASE_KEYS.PARTNERS, newPartners);
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
      // Check if should close
      if (batches[index].qtyRemKg <= 0.1 && batches[index].qtyRemCon <= 0) {
        batches[index].status = 'CLOSED';
      } else {
        batches[index].status = 'OPEN';
      }
      this.save(BASE_KEYS.BATCHES, batches);
    }
  }

  // --- LOGIC ---

  async createPurchase(
    supplierId: string,
    date: string,
    lines: { productId: string; qtyCon: number; qtyKg: number; price: number }[],
    extraCost: number,
    paidAmount: number 
  ) {
    // Override: Always treat imports as fully paid immediately (Vốn nhập)
    const products = this.getProducts();
    const partners = this.getPartners();
    const batches = this.load<Batch[]>(BASE_KEYS.BATCHES, []);
    const invoices = this.load<Invoice[]>(BASE_KEYS.INVOICES, []);
    const cash = this.load<CashTransaction[]>(BASE_KEYS.CASH, []);

    const supplier = partners.find(p => p.id === supplierId);
    if (!supplier) throw new Error("Supplier not found");

    const code = `IN-${date.replace(/-/g, '')}-${invoices.length + 1}`;
    let totalGoods = 0;
    
    // Create Batches & Line Items
    const invoiceLines: InvoiceLine[] = [];
    
    // Distribute extra cost proportionally by value
    lines.forEach(l => { totalGoods += l.qtyKg * l.price; });

    const newBatches: Batch[] = lines.map((l, idx) => {
      const lineTotal = l.qtyKg * l.price;
      const ratio = totalGoods > 0 ? lineTotal / totalGoods : 0;
      const allocatedExtra = extraCost * ratio;
      const totalBatchCost = lineTotal + allocatedExtra;
      
      const prod = products.find(p => p.id === l.productId)!;

      // SYNC PRICE: Update Product Standard Cost with the latest Import Price
      if (prod) {
        prod.standardCost = l.price;
      }

      invoiceLines.push({
        productId: l.productId,
        productName: prod.name,
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
        supplierName: supplier.name, // Save Supplier Name
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

    // Save updated products (with new standardCost)
    this.save(BASE_KEYS.PRODUCTS, products);

    const totalAmount = totalGoods + extraCost;
    // Force fully paid for imports as per business logic
    const actualPaidAmount = totalAmount; 
    const debtAmount = 0;

    // Save Invoice
    const invoice: Invoice = {
      id: `inv-${Date.now()}`,
      code,
      type: 'IMPORT',
      date,
      partnerId: supplierId,
      partnerName: supplier.name,
      totalAmount,
      paidAmount: actualPaidAmount,
      debtAmount,
      lines: invoiceLines
    };

    // Update Data
    this.save(BASE_KEYS.BATCHES, [...batches, ...newBatches]);
    this.save(BASE_KEYS.INVOICES, [invoice, ...invoices]);
    
    // Update Cash - Treat as expense (Investment)
    const txn: CashTransaction = {
      id: `txn-${Date.now()}`,
      date: new Date().toISOString(),
      type: TransactionType.EXPENSE,
      amount: actualPaidAmount,
      description: `Vốn nhập hàng: ${supplier.name}`,
      refId: invoice.id
    };
    this.save(BASE_KEYS.CASH, [txn, ...cash]);

    await delay(500); // Simulate network
    return invoice;
  }

  async createSale(
    customerId: string,
    date: string,
    lines: { productId: string; productName?: string; qtyCon: number; qtyKg: number; price: number; unit: Unit }[],
    paidAmount: number
  ) {
    const partners = this.getPartners();
    const batches = this.load<Batch[]>(BASE_KEYS.BATCHES, []); // Must be loaded fresh
    const invoices = this.load<Invoice[]>(BASE_KEYS.INVOICES, []);
    const cash = this.load<CashTransaction[]>(BASE_KEYS.CASH, []);
    const products = this.getProducts();

    const customer = partners.find(p => p.id === customerId);
    if (!customer) throw new Error("Customer not found");

    const code = `OUT-${date.replace(/-/g, '')}-${invoices.filter(i => i.type === 'EXPORT').length + 1}`;
    let totalAmount = 0;
    let totalCOGS = 0;

    const invoiceLines: InvoiceLine[] = [];

    // FIFO LOGIC
    for (const line of lines) {
      const lineAmount = (line.unit === Unit.KG ? line.qtyKg : line.qtyCon) * line.price;
      totalAmount += lineAmount;

      // Handle Manual Item (No Product ID in DB)
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
        // No COGS or Batch deduction for manual items
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

      // Deduction Logic (FIFO)
      let remainingKgToDeduct = line.qtyKg;
      let remainingConToDeduct = line.qtyCon;
      
      const productBatches = batches
        .filter(b => b.productId === line.productId && b.status === 'OPEN')
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // If no batches, we use standardCost to estimate profit if available, else 0
      if (productBatches.length === 0) {
         const estCogs = prod.standardCost ? (line.qtyKg > 0 ? line.qtyKg * prod.standardCost : 0) : 0;
         totalCOGS += estCogs;
      }

      for (const batch of productBatches) {
        if (remainingKgToDeduct <= 0 && remainingConToDeduct <= 0) break;

        const takeKg = Math.min(batch.qtyRemKg, remainingKgToDeduct);
        const takeCon = Math.min(batch.qtyRemCon, remainingConToDeduct);

        if (takeKg > 0 || takeCon > 0) {
          const cogs = takeKg * batch.costPerKg;
          totalCOGS += cogs;

          batch.qtyRemKg -= takeKg;
          batch.qtyRemCon -= takeCon;
          remainingKgToDeduct -= takeKg;
          remainingConToDeduct -= takeCon;

          if (batch.qtyRemKg <= 0.1 && batch.qtyRemCon <= 0) {
            batch.status = 'CLOSED';
          }
        }
      }
    }

    const debtAmount = totalAmount - paidAmount;

    // Save
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

    customer.debt += debtAmount; // Positive means they owe us
    this.save(BASE_KEYS.PARTNERS, partners);

    await delay(500);
    return invoice;
  }

  getDashboardStats(): DashboardStats {
    const today = new Date().toISOString().split('T')[0];
    const invoices = this.getInvoices();
    const partners = this.getPartners();

    const todayExportInvoices = invoices.filter(i => i.date === today && i.type === 'EXPORT');
    const todayImportInvoices = invoices.filter(i => i.date === today && i.type === 'IMPORT');
    
    // Revenue = Only Paid Amount (Cash collected), exclude Debt.
    const revenueToday = todayExportInvoices.reduce((sum, i) => sum + i.paidAmount, 0);
    
    // COGS = Cost of goods sold for the items in the invoice. 
    // FIXED: Only deduct COGS relative to the amount PAID. 
    // If debt (paid=0), realized COGS is 0. Profit remains 0 (no change).
    const realizedCogsToday = todayExportInvoices.reduce((sum, i) => {
        const ratio = i.totalAmount > 0 ? i.paidAmount / i.totalAmount : 0;
        return sum + ((i.cogs || 0) * ratio);
    }, 0);
    
    // Profit = Cash Revenue - Realized COGS
    const profitToday = revenueToday - realizedCogsToday;

    // Receivables (Khách nợ)
    const receivables = partners.filter(p => p.type === PartnerType.CUSTOMER).reduce((sum, p) => sum + p.debt, 0);
    
    // Import Capital (Cumulative)
    const importCapital = invoices.filter(i => i.type === 'IMPORT').reduce((sum, i) => sum + i.totalAmount, 0);

    // Import Today (For Chart)
    const importToday = todayImportInvoices.reduce((sum, i) => sum + i.totalAmount, 0);

    return {
      revenueToday,
      profitToday,
      receivables,
      importCapital,
      importToday
    };
  }
}

export const db = new Database();