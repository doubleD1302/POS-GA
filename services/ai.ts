import { db } from './db';
import { PartnerType, PaymentMethod, TransactionType } from '../types';
import { formatCurrency } from '../constants';

export type PriceSuggestion = {
  productId: string;
  productName: string;
  suggestedPrice: number;
  costRef: number;
  avgSalePrice: number;
  stockKg: number;
  reason: string;
};

export type CashflowForecast = {
  days: number;
  expectedIn: number;
  expectedOut: number;
  expectedNet: number;
};

export type InputIssue = {
  level: 'warning' | 'error';
  message: string;
};

const roundToThousand = (value: number) => Math.max(0, Math.round(value / 1000) * 1000);

export const aiService = {
  suggestSellingPrices(): PriceSuggestion[] {
    const products = db.getProducts();
    const invoices = db.getInvoices().filter(i => i.type === 'EXPORT');
    const batches = db.getBatches();

    return products.map(product => {
      const productLines = invoices
        .flatMap(i => i.lines || [])
        .filter(line => line.productId === product.id);

      const avgSalePrice = productLines.length > 0
        ? productLines.reduce((sum, line) => sum + Number(line.price || 0), 0) / productLines.length
        : 0;

      const costRef = Math.max(product.costMale || 0, product.costFemale || 0, 0);
      const baseTarget = costRef > 0 ? costRef * 1.18 : (avgSalePrice > 0 ? avgSalePrice : 0);
      const merged = avgSalePrice > 0 ? (baseTarget * 0.6 + avgSalePrice * 0.4) : baseTarget;

      const stockKg = batches
        .filter(b => b.productId === product.id && b.status === 'OPEN')
        .reduce((sum, b) => sum + Number(b.qtyRemKg || 0), 0);

      const soldKg30d = invoices
        .filter(inv => {
          const d = new Date(inv.date);
          const now = new Date();
          return now.getTime() - d.getTime() <= 30 * 24 * 60 * 60 * 1000;
        })
        .flatMap(inv => inv.lines || [])
        .filter(line => line.productId === product.id)
        .reduce((sum, line) => sum + Number(line.qtyKg || 0), 0);

      const avgDailyKg = soldKg30d > 0 ? soldKg30d / 30 : 0;
      const stockCoverageDays = avgDailyKg > 0 ? stockKg / avgDailyKg : 999;

      let adjustRatio = 1;
      let reason = 'Dựa trên giá vốn và lịch sử bán';
      if (stockCoverageDays > 25) {
        adjustRatio = 0.97;
        reason = 'Tồn kho cao, gợi ý giảm nhẹ để quay vòng hàng';
      } else if (stockCoverageDays > 0 && stockCoverageDays < 7) {
        adjustRatio = 1.05;
        reason = 'Tồn kho thấp, gợi ý tăng nhẹ để bảo toàn biên';
      }

      const suggestedPrice = roundToThousand(merged * adjustRatio);

      return {
        productId: product.id,
        productName: product.name,
        suggestedPrice,
        costRef,
        avgSalePrice,
        stockKg,
        reason,
      };
    }).sort((a, b) => b.suggestedPrice - a.suggestedPrice);
  },

  classifyOtherExpense(note: string, fallback: string): string {
    const n = (note || '').toLowerCase();
    if (!n.trim()) return fallback;

    const rules: Array<{ category: string; keywords: string[] }> = [
      { category: 'Cám', keywords: ['cám', 'thức ăn', 'thuc an', 'bao cam'] },
      { category: 'Bắp', keywords: ['bắp', 'bap', 'ngô', 'ngo'] },
      { category: 'Xăng dầu', keywords: ['xăng', 'xang', 'dầu', 'dau', 'đổ xăng', 'do xang', 'vận chuyển', 'van chuyen'] },
      { category: 'Vật tư', keywords: ['bao bì', 'bao bi', 'lồng', 'long', 'rổ', 'ro', 'dao', 'cân', 'can', 'đá', 'da'] },
    ];

    for (const rule of rules) {
      if (rule.keywords.some(keyword => n.includes(keyword))) {
        return rule.category;
      }
    }

    return fallback;
  },

  answerInternalQuestion(question: string): string {
    const q = (question || '').toLowerCase();
    const stats = db.getDashboardStats();
    const txns = db.getCashTransactions();

    if (q.includes('lãi') || q.includes('lỗ') || q.includes('lo') || q.includes('lai')) {
      const reasonParts = [
        `Doanh thu hôm nay ${formatCurrency(stats.revenueToday)}`,
        `Tổng chi hôm nay ${formatCurrency(stats.totalExpenseToday)}`,
      ];
      return `Kết quả hôm nay: ${stats.profitToday >= 0 ? 'lãi' : 'lỗ'} ${formatCurrency(stats.profitToday)}. ${reasonParts.join(', ')}.`;
    }

    if (q.includes('nợ') || q.includes('no')) {
      return `Tổng khách nợ hiện tại là ${formatCurrency(stats.receivables)}.`;
    }

    if (q.includes('chi') && q.includes('hôm nay')) {
      return `Chi hôm nay gồm nhập hàng + chi phí khác, tổng cộng ${formatCurrency(stats.totalExpenseToday)}.`;
    }

    const today = new Date().toISOString().split('T')[0];
    const income = txns.filter(t => t.date.startsWith(today) && t.type === TransactionType.INCOME).reduce((s, t) => s + t.amount, 0);
    const expense = txns.filter(t => t.date.startsWith(today) && t.type === TransactionType.EXPENSE).reduce((s, t) => s + t.amount, 0);
    return `Tóm tắt hôm nay: thu tiền ${formatCurrency(income)}, chi tiền ${formatCurrency(expense)}, doanh thu ${formatCurrency(stats.revenueToday)}, lợi nhuận ${formatCurrency(stats.profitToday)}.`;
  },

  detectInputIssues(input: { customerName?: string; customerPhone?: string; unitPrice?: number; qtyKg?: number; qtyCon?: number; productName?: string }): InputIssue[] {
    const issues: InputIssue[] = [];
    const unitPrice = Number(input.unitPrice || 0);
    const qtyKg = Number(input.qtyKg || 0);
    const qtyCon = Number(input.qtyCon || 0);

    if (!input.customerName?.trim()) {
      issues.push({ level: 'warning', message: 'Thiếu tên khách hàng.' });
    }

    const customers = db.getPartners(PartnerType.CUSTOMER);
    const phone = (input.customerPhone || '').trim();
    if (phone) {
      const samePhone = customers.filter(c => (c.phone || '').trim() === phone);
      const mismatchName = samePhone.some(c => c.name.trim().toLowerCase() !== (input.customerName || '').trim().toLowerCase());
      if (mismatchName) {
        issues.push({ level: 'warning', message: 'Số điện thoại này đang gắn với tên khách khác, cần kiểm tra trùng khách.' });
      }
    }

    const suggestions = this.suggestSellingPrices();
    const matched = suggestions.find(s => (input.productName || '').trim().toLowerCase() === s.productName.trim().toLowerCase());
    if (unitPrice > 0 && matched) {
      if (unitPrice < matched.suggestedPrice * 0.8) {
        issues.push({ level: 'warning', message: `Đơn giá thấp bất thường so với gợi ý (${formatCurrency(matched.suggestedPrice)}).` });
      }
      if (unitPrice > matched.suggestedPrice * 1.4) {
        issues.push({ level: 'warning', message: `Đơn giá cao bất thường so với gợi ý (${formatCurrency(matched.suggestedPrice)}).` });
      }
    }

    if (qtyKg > 200) {
      issues.push({ level: 'warning', message: 'Số kg khá lớn, nên kiểm tra lại tránh nhập nhầm.' });
    }
    if (qtyCon > 500) {
      issues.push({ level: 'warning', message: 'Số con khá lớn, nên kiểm tra lại tránh nhập nhầm.' });
    }

    if (qtyKg <= 0 && qtyCon <= 0) {
      issues.push({ level: 'error', message: 'Cần nhập ít nhất số kg hoặc số con.' });
    }

    return issues;
  },

  forecastCashflow(days: number): CashflowForecast {
    const horizon = Math.max(7, Math.min(30, days));
    const txns = db.getCashTransactions();
    const now = new Date();

    const recent = txns.filter(t => now.getTime() - new Date(t.date).getTime() <= 30 * 24 * 60 * 60 * 1000);
    const income30 = recent.filter(t => t.type === TransactionType.INCOME).reduce((s, t) => s + t.amount, 0);
    const expense30 = recent.filter(t => t.type === TransactionType.EXPENSE).reduce((s, t) => s + t.amount, 0);

    const avgIn = income30 / 30;
    const avgOut = expense30 / 30;

    return {
      days: horizon,
      expectedIn: roundToThousand(avgIn * horizon),
      expectedOut: roundToThousand(avgOut * horizon),
      expectedNet: roundToThousand((avgIn - avgOut) * horizon),
    };
  },

  getPaymentMethodLabel(method?: PaymentMethod) {
    if (method === PaymentMethod.CASH) return 'Tiền mặt';
    if (method === PaymentMethod.TRANSFER) return 'Chuyển khoản';
    if (method === PaymentMethod.DEBT) return 'Ghi nợ';
    return 'Chưa xác định';
  }
};
