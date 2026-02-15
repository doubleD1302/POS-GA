export enum Unit {
  CON = 'CON',
  KG = 'KG',
}

export enum TransactionType {
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE',
  TRANSFER = 'TRANSFER',
}

export enum PaymentStatus {
  PAID = 'PAID',
  PARTIAL = 'PARTIAL',
  UNPAID = 'UNPAID',
}

export enum PartnerType {
  CUSTOMER = 'CUSTOMER',
  SUPPLIER = 'SUPPLIER',
}

export enum PaymentMethod {
  CASH = 'CASH',
  TRANSFER = 'TRANSFER',
  DEBT = 'DEBT',
}

export interface BankSettings {
  bankId: string; // e.g. MB, VCB
  accountNo: string;
  accountName: string;
  template: string; // 'compact' | 'qr_only'
}

export interface Product {
  id: string;
  name: string; // e.g., Gà ta, Gà ri
  priceMale: number;    // Giá bán Trống
  priceFemale: number;  // Giá bán Mái
  costMale: number;     // Giá nhập Trống
  costFemale: number;   // Giá nhập Mái
}

export interface Partner {
  id: string;
  name: string;
  phone: string;
  type: PartnerType;
  debt: number; // Positive means they owe us (Customer) or we owe them (Supplier)
}

export interface Batch {
  id: string;
  code: string;
  productId: string;
  gender: Gender;
  supplierId: string;
  supplierName?: string; // Added field
  date: string;
  
  qtyInCon: number;
  qtyInKg: number;
  
  qtyRemCon: number;
  qtyRemKg: number;

  baseCost: number; // Cost of goods
  extraCost: number; // Transport, etc.
  totalCost: number;
  
  costPerKg: number;
  costPerCon: number; // Calculated based on input
  
  status: 'OPEN' | 'CLOSED';
}

export interface InvoiceLine {
  productId: string;
  productName: string;
  gender: Gender;
  qtyCon: number;
  qtyKg: number;
  unit: Unit;
  price: number;
  amount: number;
  gross?: number;    
  tare?: number;     
  details?: string;  
}

export interface Invoice {
  id: string;
  code: string;
  type: 'IMPORT' | 'EXPORT';
  date: string;
  partnerId: string;
  partnerName: string;
  totalAmount: number;
  paidAmount: number;
  debtAmount: number;
  lines: InvoiceLine[];
  paymentMethod?: PaymentMethod;
  cogs?: number; // Only for EXPORT
}

export interface CashTransaction {
  id: string;
  date: string;
  type: TransactionType;
  amount: number;
  description: string;
  refId?: string; // Invoice ID
}

export interface DashboardStats {
  revenueToday: number;
  profitToday: number;
  receivables: number;
  importCapital: number; // Total cumulative
  importToday: number; // Only today
}

export interface PreOrder {
  id: string;
  customerName: string;
  phone?: string;
  productNote: string; // e.g. "Gà mái tơ"
  qtyCon?: number;
  qtyKg?: number;
  deliveryTime: string; // ISO string
  note?: string;
  status: 'PENDING' | 'DONE';
}

export type Gender = 'MALE' | 'FEMALE';