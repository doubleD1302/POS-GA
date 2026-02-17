import { db } from './db';
import { PartnerType, PaymentMethod, TransactionType } from '../types';
import { formatCurrency } from '../constants';

export const GEMINI_MODELS = [
  'gemini-3.0-flash',
  'gemini-3.0-pro',
  'gemini-3.0-flash-thinking',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
] as const;

export type GeminiModel = typeof GEMINI_MODELS[number];

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

export type ChatMessage = {
  role: 'user' | 'ai';
  text: string;
};

export type AskGeminiResult = {
  answer: string;
  usedModel: GeminiModel;
  switchedModel: boolean;
  source: 'gemini' | 'fallback';
  reason?: string;
};

export type GeminiHealthResult = {
  ok: boolean;
  model: GeminiModel;
  message: string;
};

const roundToThousand = (value: number) => Math.max(0, Math.round(value / 1000) * 1000);

const safeNumber = (value: any) => Number(value || 0);

const buildBusinessContext = () => {
  const stats = db.getDashboardStats();
  const products = db.getProducts();
  const preOrders = db.getPreOrders().filter(o => o.status !== 'DONE');
  const invoices = db.getInvoices().slice(0, 40);
  const txns = db.getCashTransactions().slice(0, 80);

  const productSnapshot = products.slice(0, 20).map(p => ({
    name: p.name,
    priceMale: safeNumber(p.priceMale),
    costMale: safeNumber(p.costMale),
    costFemale: safeNumber(p.costFemale),
  }));

  const invoiceSnapshot = invoices.map(inv => ({
    date: inv.date,
    type: inv.type,
    total: safeNumber(inv.totalAmount),
    paidAmount: safeNumber(inv.paidAmount),
    customer: inv.partnerName,
    lineCount: (inv.lines || []).length,
  }));

  const txnSnapshot = txns.map(t => ({
    date: t.date,
    type: t.type,
    amount: safeNumber(t.amount),
    category: t.type,
    desc: t.description,
  }));

  const preOrderSnapshot = preOrders.map(o => ({
    customerName: o.customerName,
    phone: o.phone,
    productNote: o.productNote,
    qtyCon: safeNumber(o.qtyCon),
    qtyKg: safeNumber(o.qtyKg),
    unitPrice: safeNumber(o.unitPrice),
    status: o.status,
    deliveryTime: o.deliveryTime,
  }));

  return {
    now: new Date().toISOString(),
    stats,
    productSnapshot,
    invoiceSnapshot,
    txnSnapshot,
    preOrderSnapshot,
  };
};

const getGeminiApiKey = () => {
  const savedKey = db.getGeminiApiKey();
  const viteEnv = (import.meta as any)?.env || {};
  const viteKey = viteEnv.VITE_GEMINI_API_KEY;
  const rawKey = viteEnv.GEMINI_API_KEY;
  const processEnv = ((globalThis as any)?.process?.env) || {};
  const processViteKey = processEnv.VITE_GEMINI_API_KEY;
  const processRawKey = processEnv.GEMINI_API_KEY || processEnv.API_KEY;
  return (savedKey || viteKey || rawKey || processViteKey || processRawKey || '').trim();
};

const isTokenOrQuotaError = (status: number, message: string) => {
  const m = (message || '').toLowerCase();
  return status === 429 || m.includes('quota') || m.includes('resource_exhausted') || m.includes('token');
};

const isRecoverableModelError = (status: number, message: string) => {
  const m = (message || '').toLowerCase();
  return (
    status === 400 ||
    status === 403 ||
    status === 404 ||
    status === 429 ||
    m.includes('not found') ||
    m.includes('unsupported') ||
    m.includes('permission') ||
    m.includes('quota') ||
    m.includes('resource_exhausted') ||
    m.includes('model')
  );
};

const summarizeFallbackReason = (message: string) => {
  const m = (message || '').toLowerCase();
  if (m.includes('quota') || m.includes('resource_exhausted') || m.includes('429')) return 'Hết quota hoặc giới hạn token';
  if (m.includes('permission') || m.includes('403')) return 'API key hoặc quyền truy cập model chưa phù hợp';
  if (m.includes('not found') || m.includes('404') || m.includes('unsupported')) return 'Model không khả dụng cho key hiện tại';
  if (m.includes('failed to fetch') || m.includes('network') || m.includes('cors')) return 'Mất kết nối mạng hoặc bị chặn truy cập Gemini';
  return 'Lỗi tạm thời từ Gemini API';
};

export const aiService = {
  getGeminiModels(): GeminiModel[] {
    return [...GEMINI_MODELS];
  },

  getGeminiApiKeyGuide(): string {
    return [
      'Hướng dẫn lấy Gemini API key:',
      '1) Vào Google AI Studio: https://aistudio.google.com',
      '2) Đăng nhập tài khoản Google.',
      '3) Mở mục API keys / Get API key.',
      '4) Tạo key mới và sao chép chuỗi bắt đầu bằng AIza...',
      '5) Quay lại app, bấm nút Set API key rồi dán key vào ô chat.',
      'Lưu ý: Mỗi tài khoản doanh nghiệp trong app sẽ lưu key riêng trên Supabase.'
    ].join('\n');
  },

  async checkGeminiConnection(selectedModel: GeminiModel): Promise<GeminiHealthResult> {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      return {
        ok: false,
        model: selectedModel,
        message: 'Thiếu GEMINI_API_KEY trong môi trường chạy app.',
      };
    }

    const models = this.getGeminiModels();
    const startIndex = Math.max(0, models.indexOf(selectedModel));
    const modelQueue = [...models.slice(startIndex), ...models.slice(0, startIndex)];

    for (let idx = 0; idx < modelQueue.length; idx++) {
      const model = modelQueue[idx];
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'Trả lời đúng 1 từ: OK' }] }],
            generationConfig: { temperature: 0, maxOutputTokens: 8 },
          }),
        });

        if (!res.ok) {
          const errorText = await res.text();
          if (isRecoverableModelError(res.status, errorText) && idx < modelQueue.length - 1) {
            continue;
          }
          return {
            ok: false,
            model,
            message: `Kết nối thất bại (${res.status}): ${summarizeFallbackReason(errorText)}`,
          };
        }

        return {
          ok: true,
          model,
          message: model === selectedModel
            ? `Kết nối Gemini OK với model ${model}.`
            : `Kết nối Gemini OK. Đã tự dùng model ${model} do model chọn không khả dụng.`,
        };
      } catch (error: any) {
        const message = String(error?.message || error || '');
        if (isRecoverableModelError(400, message) && idx < modelQueue.length - 1) {
          continue;
        }
        return {
          ok: false,
          model,
          message: `Kết nối thất bại: ${summarizeFallbackReason(message)}`,
        };
      }
    }

    return {
      ok: false,
      model: selectedModel,
      message: 'Không có model Gemini khả dụng với API key hiện tại.',
    };
  },

  async askGemini(question: string, selectedModel: GeminiModel, history: ChatMessage[] = []): Promise<AskGeminiResult> {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      return {
        answer: 'Chưa cấu hình GEMINI_API_KEY. Mình tạm trả lời theo dữ liệu nội bộ: ' + this.answerInternalQuestion(question),
        usedModel: selectedModel,
        switchedModel: false,
        source: 'fallback',
        reason: 'Thiếu GEMINI_API_KEY',
      };
    }

    const models = this.getGeminiModels();
    const startIndex = Math.max(0, models.indexOf(selectedModel));
    const modelQueue = [...models.slice(startIndex), ...models.slice(0, startIndex)];

    const context = buildBusinessContext();
    const recentHistory = history.slice(-6);
    const systemPrompt = [
      'Bạn là trợ lý vận hành cho cửa hàng gà thịt.',
      'Trả lời bằng tiếng Việt, đúng trọng tâm, ngắn gọn, dễ hiểu.',
      'Không giới hạn cứng độ dài bằng kỹ thuật; tự điều tiết theo yêu cầu người dùng.',
      'Mặc định trả lời cô đọng: 3-6 ý ngắn, mỗi ý 1-2 câu, tập trung vào hành động.',
      'Phải dựa trên BUSINESS_DATA, không bịa số liệu.',
      'Nếu dữ liệu không đủ thì nêu rõ thiếu dữ liệu nào.',
      'Ưu tiên gợi ý hành động thực tế cho chủ cửa hàng.',
      'Không lan man, không lặp ý, không mở rộng ngoài câu hỏi.'
    ].join('\n');

    const userPrompt = JSON.stringify({
      task: question,
      chat_history: recentHistory,
      BUSINESS_DATA: context,
    });

    for (let idx = 0; idx < modelQueue.length; idx++) {
      const model = modelQueue[idx];
      try {
        const runGenerate = async (promptText: string) => {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: promptText }] }],
              generationConfig: {
                temperature: 0.25,
                topP: 0.85,
                maxOutputTokens: 8192,
              },
            }),
          });

          if (!res.ok) {
            const errorText = await res.text();
            throw new Error(errorText || `Gemini error ${res.status}`);
          }

          const data = await res.json();
          const candidate = data?.candidates?.[0];
          const text = (candidate?.content?.parts || [])
            .map((part: any) => part?.text || '')
            .join('')
            .trim();
          const finishReason = String(candidate?.finishReason || '').toUpperCase();
          return { text, finishReason };
        };

        const first = await runGenerate(`${systemPrompt}\n\n${userPrompt}`);
        if (!first.text) {
          throw new Error('Gemini không trả về nội dung.');
        }

        let finalAnswer = first.text;
        if (first.finishReason === 'MAX_TOKENS' || first.finishReason === 'LENGTH') {
          const continued = await runGenerate([
            systemPrompt,
            'Bạn vừa bị cắt do giới hạn độ dài.',
            'Hãy viết tiếp phần còn thiếu thật ngắn gọn, không lặp lại nội dung đã viết.',
            `Câu hỏi: ${question}`,
            `Đoạn đã có: ${first.text}`,
          ].join('\n\n'));

          if (continued.text) {
            finalAnswer = `${first.text}\n${continued.text}`;
          }
        }

        return {
          answer: finalAnswer,
          usedModel: model,
          switchedModel: model !== selectedModel,
          source: 'gemini',
        };
      } catch (error: any) {
        const message = String(error?.message || error || '');
        if ((isTokenOrQuotaError(429, message) || isRecoverableModelError(400, message)) && idx < modelQueue.length - 1) {
          continue;
        }

        const reason = summarizeFallbackReason(message);
        return {
          answer: `Gemini tạm lỗi (${reason}), mình chuyển sang trả lời nội bộ:\n${this.answerInternalQuestion(question)}`,
          usedModel: selectedModel,
          switchedModel: false,
          source: 'fallback',
          reason,
        };
      }
    }

    return {
      answer: `Model đang hết quota/token, mình tạm trả lời nội bộ: ${this.answerInternalQuestion(question)}`,
      usedModel: selectedModel,
      switchedModel: false,
      source: 'fallback',
      reason: 'Hết quota hoặc giới hạn token',
    };
  },

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
