import React, { useEffect, useRef, useState } from 'react';
import { db } from '../services/db';
import { DashboardStats, PartnerType, PreOrder, Unit, PaymentMethod, BankSettings } from '../types';
import { aiService, GeminiModel } from '../services/ai';
import { formatCurrency, ICONS } from '../constants';
import { StatCard, Button, Card, Input, Select, Modal } from '../components/ui';

export default function Dashboard({ navigate, onLogout }: { navigate: (page: string) => void, onLogout: () => void }) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isSalesExpanded, setIsSalesExpanded] = useState(false);
  const [isSalesUnlocked, setIsSalesUnlocked] = useState(false);
  const [isExpenseExpanded, setIsExpenseExpanded] = useState(false);
  const [otherExpenseCategory, setOtherExpenseCategory] = useState('Cám');
  const [otherExpenseAmount, setOtherExpenseAmount] = useState('');
  const [otherExpenseNote, setOtherExpenseNote] = useState('');
  const [isSavingExpense, setIsSavingExpense] = useState(false);
  const [preOrders, setPreOrders] = useState<PreOrder[]>([]);
  const [orderView, setOrderView] = useState<'PENDING' | 'PREPARED'>('PENDING');
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<PreOrder | null>(null);
  const [poName, setPoName] = useState('');
  const [poPhone, setPoPhone] = useState('');
  const [poProduct, setPoProduct] = useState('');
  const [poCon, setPoCon] = useState('');
  const [poKg, setPoKg] = useState('');
  const [poPrice, setPoPrice] = useState('');
  const [poTime, setPoTime] = useState('');
  const [poNote, setPoNote] = useState('');
  const [quickCustomerOptions, setQuickCustomerOptions] = useState<{ name: string; phone?: string }[]>([]);
  const [showDeliveryPayment, setShowDeliveryPayment] = useState(false);
  const [deliveryPaymentMethod, setDeliveryPaymentMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [deliveryPaidAmount, setDeliveryPaidAmount] = useState(0);
  const [isDeliveryQrPreviewOpen, setIsDeliveryQrPreviewOpen] = useState(false);
  const [isAiChatOpen, setIsAiChatOpen] = useState(false);
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiMessages, setAiMessages] = useState<Array<{ role: 'user' | 'ai'; text: string }>>([
    { role: 'ai', text: 'Xin chào! Mình có thể gợi ý giá bán, phát hiện nhập liệu bất thường và trả lời nhanh theo dữ liệu nội bộ.' }
  ]);
  const [isAskingAi, setIsAskingAi] = useState(false);
  const [aiModel, setAiModel] = useState<GeminiModel>('gemini-2.5-flash');
  const [isAwaitingApiKeyInput, setIsAwaitingApiKeyInput] = useState(false);
  const [forecastDays, setForecastDays] = useState<7 | 30>(7);
  const aiMessagesRef = useRef<HTMLDivElement | null>(null);

  const customerOptions = db.getPartners(PartnerType.CUSTOMER);
  const normalizeValue = (value: string) => (value || '').trim().toLowerCase();
  const filteredQuickCustomerOptions = quickCustomerOptions.filter(q => {
    const quickName = normalizeValue(q.name || '');
    const quickPhone = normalizeValue(q.phone || '');
    return !customerOptions.some(c => {
      const customerName = normalizeValue(c.name || '');
      const customerPhone = normalizeValue(c.phone || '');
      if (quickPhone && customerPhone && quickPhone === customerPhone) return true;
      return quickName === customerName && quickPhone === customerPhone;
    });
  });
  const productOptions = db.getProducts();
  const manualGoodsOptions = Array.from(new Set([
    ...db.getInvoices()
      .flatMap(inv => inv.lines || [])
      .filter(line => line.productId === 'MANUAL' && !!line.productName)
      .map(line => line.productName.trim())
      .filter(Boolean),
    ...db.getQuickItems()
  ]));
  const priceSuggestions = aiService.suggestSellingPrices().slice(0, 4);
  const cashflowForecast = aiService.forecastCashflow(forecastDays);
  const geminiModels = aiService.getGeminiModels();
  const bankSettings: BankSettings | null = db.getBankSettings();

  const refreshStats = () => {
    const data = db.getDashboardStats();
    setStats(data);
  };

  const reloadPreOrders = () => {
    setPreOrders(db.getPreOrders().filter(o => o.status !== 'DONE'));
  };

  useEffect(() => {
    refreshStats();
    reloadPreOrders();
    setQuickCustomerOptions(db.getQuickCustomers());
  }, []);

  useEffect(() => {
    if (!isAiChatOpen) return;
    const container = aiMessagesRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [aiMessages, isAskingAi, isAiChatOpen]);

  if (!stats) return <div className="p-4">Đang tải...</div>;

  const handleSalesSecurityToggle = () => {
    if (isSalesUnlocked) {
      setIsSalesUnlocked(false);
      setIsSalesExpanded(false);
      return;
    }

    const currentCode = localStorage.getItem('gttd_current_business_id');
    const inputCode = window.prompt('🔒 Nhập Mã Doanh Nghiệp để mở chi tiết doanh số:');

    if (inputCode === currentCode) {
      setIsSalesUnlocked(true);
      setIsSalesExpanded(true);
      return;
    }

    if (inputCode !== null) {
      alert('❌ Mã không đúng. Không thể mở chi tiết doanh số.');
    }
  };

  const handleSalesMenuClick = () => {
    if (!isSalesUnlocked) {
      handleSalesSecurityToggle();
      return;
    }
    setIsSalesExpanded(prev => !prev);
  };

  const handleCreateOtherExpense = async () => {
    const amount = Number(otherExpenseAmount);
    if (!amount || amount <= 0) {
      alert('Vui lòng nhập số tiền chi hợp lệ');
      return;
    }

    const smartCategory = aiService.classifyOtherExpense(otherExpenseNote, otherExpenseCategory);
    if (smartCategory !== otherExpenseCategory) {
      setOtherExpenseCategory(smartCategory);
    }

    setIsSavingExpense(true);
    try {
      await db.createOtherExpense(amount, smartCategory, otherExpenseNote);
      setOtherExpenseAmount('');
      setOtherExpenseNote('');
      refreshStats();
      alert('Đã ghi nhận khoản chi');
    } catch (e: any) {
      alert(e.message || 'Không thể lưu khoản chi');
    } finally {
      setIsSavingExpense(false);
    }
  };

  const handleOpenOrderModal = (order?: PreOrder) => {
    if (order) {
      setSelectedOrder(order); setPoName(order.customerName); setPoPhone(order.phone || '');
      setPoProduct(order.productNote); setPoCon(order.qtyCon?.toString() || ''); setPoKg(order.qtyKg?.toString() || '');
      setPoPrice(order.unitPrice ? String(order.unitPrice) : '');
      setPoTime(order.deliveryTime); setPoNote(order.note || '');
      const total = ((Number(order.qtyKg) || 0) > 0 ? (Number(order.qtyKg) || 0) : (Number(order.qtyCon) || 0)) * (Number(order.unitPrice) || 0);
      setDeliveryPaymentMethod(PaymentMethod.CASH);
      setDeliveryPaidAmount(total);
    } else {
      setSelectedOrder(null); setPoName(''); setPoPhone(''); setPoProduct(''); setPoCon(''); setPoKg('');
      setPoPrice('');
      const now = new Date(); now.setHours(now.getHours() + 1); now.setMinutes(0); setPoTime(now.toISOString().slice(0, 16)); setPoNote('');
      setDeliveryPaymentMethod(PaymentMethod.CASH);
      setDeliveryPaidAmount(0);
    }
    setShowDeliveryPayment(false);
    setIsOrderModalOpen(true);
  }

  const handleSaveOrder = () => {
    if (!poName || !poTime) return alert('Cần nhập tên khách và giờ hẹn');
    db.saveQuickCustomer(poName, poPhone);
    db.saveQuickItem(poProduct);
    setQuickCustomerOptions(db.getQuickCustomers());
    const order: PreOrder = {
      id: selectedOrder ? selectedOrder.id : `po-${Date.now()}`,
      customerName: poName,
      phone: poPhone,
      productNote: poProduct,
      qtyCon: Number(poCon) || 0,
      qtyKg: Number(poKg) || 0,
      unitPrice: Number(poPrice) || 0,
      deliveryTime: poTime,
      note: poNote,
      status: selectedOrder?.status || 'PENDING'
    };
    db.savePreOrder(order);
    reloadPreOrders();
    setIsOrderModalOpen(false);
  }

  const handleDeleteOrder = () => {
    if (!selectedOrder) return;
    if (window.confirm('Xoá đơn đặt hàng này?')) {
      db.deletePreOrder(selectedOrder.id);
      reloadPreOrders();
      setIsOrderModalOpen(false);
    }
  }

  const handleMarkPreparedOrder = () => {
    if (!selectedOrder) return;
    db.savePreOrder({ ...selectedOrder, status: 'PREPARED' });
    reloadPreOrders();
    setIsOrderModalOpen(false);
  }

  const handleSelectSuggestedCustomer = (customerId: string) => {
    if (!customerId) return;

    if (customerId.startsWith('partner:')) {
      const id = customerId.replace('partner:', '');
      const customer = customerOptions.find(c => c.id === id);
      if (!customer) return;
      setPoName(customer.name || '');
      setPoPhone(customer.phone || '');
      return;
    }

    if (customerId.startsWith('quick:')) {
      const payload = customerId.replace('quick:', '');
      const [encodedName, encodedPhone] = payload.split('::');
      setPoName(decodeURIComponent(encodedName || ''));
      setPoPhone(decodeURIComponent(encodedPhone || ''));
    }
  };

  const handleSelectSuggestedProduct = (value: string) => {
    if (!value) return;
    const foundProduct = productOptions.find(p => p.id === value || p.name === value);
    if (foundProduct) {
      setPoProduct(foundProduct.name);
      const quickPrice = Number(foundProduct.priceMale || 0);
      if (quickPrice > 0 && !poPrice) setPoPrice(String(quickPrice));
      db.saveQuickItem(foundProduct.name);
      return;
    }
    setPoProduct(value);
    db.saveQuickItem(value);
  };

  const handleDeleteQuickCustomer = (name: string, phone?: string) => {
    db.deleteQuickCustomer(name, phone);
    setQuickCustomerOptions(db.getQuickCustomers());
  };

  const handleDeliverSuccess = async () => {
    if (!selectedOrder) return;

    const qtyCon = Number(poCon) || 0;
    const qtyKg = Number(poKg) || 0;
    const unitPrice = Number(poPrice) || 0;
    const orderTotal = (qtyKg > 0 ? qtyKg : qtyCon) * unitPrice;

    if (!poName || !poProduct || !poTime) return alert('Vui lòng nhập đủ khách hàng, hàng hoá và thời gian giao.');
    if (qtyCon <= 0 && qtyKg <= 0) return alert('Cần nhập ít nhất Số con hoặc Số kg.');
    if (unitPrice <= 0) return alert('Vui lòng nhập đơn giá hợp lệ để xuất hoá đơn.');

    let paidAmount = Number(deliveryPaidAmount) || 0;
    if (deliveryPaymentMethod === PaymentMethod.DEBT) {
      paidAmount = 0;
    }
    if (paidAmount < 0 || paidAmount > orderTotal) {
      return alert('Số tiền khách trả không hợp lệ.');
    }

    let customer = customerOptions.find(c => (poPhone && c.phone === poPhone) || c.name.trim().toLowerCase() === poName.trim().toLowerCase());
    if (!customer) {
      customer = {
        id: `partner-${Date.now()}`,
        name: poName.trim(),
        phone: poPhone.trim(),
        type: PartnerType.CUSTOMER,
        debt: 0
      };
      db.savePartner(customer);
    }

    const matchedProduct = productOptions.find(p => p.name.trim().toLowerCase() === poProduct.trim().toLowerCase());
    const saleLine = matchedProduct ? {
      productId: matchedProduct.id,
      productName: matchedProduct.name,
      qtyCon,
      qtyKg,
      unit: qtyKg > 0 ? Unit.KG : Unit.CON,
      price: unitPrice,
      gender: 'MALE'
    } : {
      productId: 'MANUAL',
      productName: poProduct,
      qtyCon,
      qtyKg,
      unit: qtyKg > 0 ? Unit.KG : Unit.CON,
      price: unitPrice,
      gender: 'MALE'
    };

    try {
      db.saveQuickCustomer(poName, poPhone);
      db.saveQuickItem(poProduct);
      setQuickCustomerOptions(db.getQuickCustomers());
      await db.createSale(customer.id, poTime.split('T')[0], [saleLine], paidAmount, deliveryPaymentMethod);
      db.savePreOrder({
        ...selectedOrder,
        customerName: poName,
        phone: poPhone,
        productNote: poProduct,
        qtyCon,
        qtyKg,
        unitPrice,
        deliveryTime: poTime,
        note: poNote,
        status: 'DONE'
      });
      reloadPreOrders();
      refreshStats();
      setIsOrderModalOpen(false);
      setShowDeliveryPayment(false);
      alert('Đã giao hàng thành công và xuất hoá đơn.');
    } catch (e: any) {
      alert(e.message || 'Không thể xuất hoá đơn giao hàng.');
    }
  }

  const pushAiMessage = (question: string, answer: string) => {
    setAiMessages(prev => [...prev, { role: 'user', text: question }, { role: 'ai', text: answer }]);
  };

  const handleShowApiKeyGuide = () => {
    pushAiMessage('Hướng dẫn lấy Gemini API key', aiService.getGeminiApiKeyGuide());
  };

  const handleStartSetApiKey = () => {
    setIsAwaitingApiKeyInput(true);
    setAiMessages(prev => [...prev, {
      role: 'ai',
      text: 'Vui lòng nhập Gemini API key mới vào ô chat (chuỗi bắt đầu bằng AIza...). Mình sẽ lưu làm key mặc định cho tài khoản này trên Supabase.'
    }]);
  };

  const isLikelyGeminiKey = (value: string) => /^AIza[0-9A-Za-z\-_]{20,}$/.test((value || '').trim());

  const handleAskAI = async () => {
    if (!aiQuestion.trim() || isAskingAi) return;
    const question = aiQuestion.trim();

    if (isAwaitingApiKeyInput) {
      setAiQuestion('');
      setAiMessages(prev => [...prev, { role: 'user', text: 'Đã gửi API key mới' }]);

      if (!isLikelyGeminiKey(question)) {
        setAiMessages(prev => [...prev, {
          role: 'ai',
          text: 'Key chưa đúng định dạng Gemini (cần bắt đầu bằng AIza...). Vui lòng nhập lại.'
        }]);
        return;
      }

      setIsAskingAi(true);
      try {
        await db.saveGeminiApiKey(question);
        setIsAwaitingApiKeyInput(false);
        setAiMessages(prev => [...prev, {
          role: 'ai',
          text: '✅ Đã lưu API key mặc định cho tài khoản này trên Supabase.'
        }]);
      } catch (_e: any) {
        setAiMessages(prev => [...prev, {
          role: 'ai',
          text: '❌ Không thể lưu API key lúc này. Vui lòng kiểm tra kết nối và thử lại.'
        }]);
        setIsAskingAi(false);
        return;
      }

      try {
        const check = await aiService.checkGeminiConnection(aiModel);
        setAiMessages(prev => [...prev, {
          role: 'ai',
          text: `${check.ok ? '✅' : '❌'} ${check.message}`,
        }]);
        if (check.ok && check.model !== aiModel) {
          setAiModel(check.model);
        }
      } catch (_e: any) {
        setAiMessages(prev => [...prev, {
          role: 'ai',
          text: '⚠️ Đã lưu API key nhưng chưa thể kiểm tra kết nối Gemini ngay lúc này.'
        }]);
      } finally {
        setIsAskingAi(false);
      }
      return;
    }

    const history = [...aiMessages, { role: 'user' as const, text: question }];
    setAiMessages(prev => [...prev, { role: 'user', text: question }]);
    setAiQuestion('');

    setIsAskingAi(true);
    try {
      const result = await aiService.askGemini(question, aiModel, history);
      setAiMessages(prev => [...prev, { role: 'ai', text: result.answer }]);
      if (result.source === 'fallback') {
        setAiMessages(prev => [...prev, { role: 'ai', text: `⚠️ Đang dùng phản hồi nội bộ do: ${result.reason || 'Lỗi Gemini tạm thời'}.` }]);
      }
      if (result.switchedModel && result.usedModel !== aiModel) {
        setAiModel(result.usedModel);
        setAiMessages(prev => [...prev, { role: 'ai', text: `Mình đã tự chuyển sang model ${result.usedModel} vì model trước bị giới hạn quota/token.` }]);
      }
    } catch (_e: any) {
      setAiMessages(prev => [...prev, { role: 'ai', text: aiService.answerInternalQuestion(question) }]);
    } finally {
      setIsAskingAi(false);
    }
  };

  const handleAiShortcut = (shortcut: 'PRICE' | 'ANOMALY' | 'FORECAST_7' | 'FORECAST_30') => {
    if (shortcut === 'PRICE') {
      const top = priceSuggestions.slice(0, 3);
      const answer = top.length === 0
        ? 'Hiện chưa đủ dữ liệu để gợi ý giá bán.'
        : top.map((s, idx) => `${idx + 1}. ${s.productName}: ${formatCurrency(s.suggestedPrice)} (${s.reason})`).join('\n');
      pushAiMessage('Gợi ý giá bán hôm nay', answer);
      return;
    }

    if (shortcut === 'ANOMALY') {
      const answer = draftIssues.length === 0
        ? 'Không phát hiện bất thường rõ ràng ở dữ liệu đơn đang nhập.'
        : draftIssues.map((issue, idx) => `${idx + 1}. ${issue.message}`).join('\n');
      pushAiMessage('Kiểm tra bất thường nhập liệu', answer);
      return;
    }

    const days = shortcut === 'FORECAST_30' ? 30 : 7;
    const forecast = aiService.forecastCashflow(days);
    const answer = `Dự báo ${forecast.days} ngày:\n- Thu: ${formatCurrency(forecast.expectedIn)}\n- Chi: ${formatCurrency(forecast.expectedOut)}\n- Ròng: ${formatCurrency(forecast.expectedNet)}`;
    pushAiMessage(`Dự báo dòng tiền ${days} ngày`, answer);
  };

  const handleCheckGemini = async () => {
    if (isAskingAi) return;
    setIsAskingAi(true);
    try {
      const result = await aiService.checkGeminiConnection(aiModel);
      setAiMessages(prev => [...prev, {
        role: 'ai',
        text: `${result.ok ? '✅' : '❌'} ${result.message}`,
      }]);
      if (result.ok && result.model !== aiModel) {
        setAiModel(result.model);
      }
    } catch (_e: any) {
      setAiMessages(prev => [...prev, {
        role: 'ai',
        text: '❌ Không thể kiểm tra kết nối Gemini lúc này. Vui lòng thử lại sau.',
      }]);
    } finally {
      setIsAskingAi(false);
    }
  };

  const formatTime = (isoString: string) => { try { const d = new Date(isoString); return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`; } catch (e) { return ''; } }
  const formatDateShort = (isoString: string) => { try { const d = new Date(isoString); return `${d.getDate()}/${d.getMonth() + 1}`; } catch (e) { return ''; } }
  const getDeliveryQrLink = () => {
    if (!bankSettings || !bankSettings.bankId || !bankSettings.accountNo) return null;
    const normalize = (str: string) => (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
    const customerName = poName || 'Khach hang';
    const template = bankSettings.template || 'compact';
    const transferAmount = Math.max(0, Number(deliveryPaidAmount) || Number(draftTotal) || 0);
    const info = normalize(customerName).substring(0, 50);
    const amountParam = transferAmount > 0 ? `amount=${transferAmount}&` : '';
    return `https://img.vietqr.io/image/${bankSettings.bankId}-${bankSettings.accountNo}-${template}.png?${amountParam}addInfo=${encodeURIComponent(info)}`;
  };
  const handleOpenDeliveryQrFullscreen = () => {
    if (!deliveryQrLink) return;
    setIsDeliveryQrPreviewOpen(true);
  };
  const handleDownloadDeliveryQr = async () => {
    const qr = getDeliveryQrLink();
    if (!qr) return;
    try {
      const response = await fetch(qr);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vietqr-don-giao-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (_e) {
      window.open(qr, '_blank', 'noopener,noreferrer');
    }
  };
  const draftIssues = aiService.detectInputIssues({
    customerName: poName,
    customerPhone: poPhone,
    unitPrice: Number(poPrice) || 0,
    qtyKg: Number(poKg) || 0,
    qtyCon: Number(poCon) || 0,
    productName: poProduct,
  });
  const draftTotal = (Number(poKg) > 0 ? Number(poKg) : Number(poCon)) * (Number(poPrice) || 0);
  const deliveryQrLink = getDeliveryQrLink();

  return (
    <div className="space-y-4 pb-20">
      <header className="flex justify-between items-start mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Tổng quan</h1>
          <p className="text-sm text-gray-500">{new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>

        <button
          onClick={onLogout}
          className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 transition-colors"
        >
          Đổi TK ↻
        </button>
      </header>

      <Card className="p-0 overflow-hidden">
        <div className="p-4 flex items-center justify-between gap-3">
          <button onClick={handleSalesMenuClick} className="flex-1 text-left hover:opacity-90 transition-opacity">
            <div>
              <h3 className="text-base font-bold text-gray-800">Quản lý doanh số</h3>
              <p className="text-xs text-gray-500 mt-1">
                {!isSalesUnlocked ? 'Nhấn để nhập mã và mở bảng chỉ số' : isSalesExpanded ? 'Đang mở chi tiết. Nhấn lại để thu gọn.' : 'Đã mở khoá. Nhấn để xem lại chi tiết.'}
              </p>
            </div>
          </button>
          <button
            onClick={handleSalesSecurityToggle}
            className={`text-xs font-bold px-2 py-1 rounded border ${isSalesUnlocked ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}
          >
            {isSalesUnlocked ? 'Đóng' : 'Xem'}
          </button>
        </div>

        {isSalesExpanded && isSalesUnlocked && (
          <div className="border-t border-gray-100 p-4 space-y-3 bg-gray-50">
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Lãi gộp hôm nay" value={formatCurrency(stats.profitToday)} color={stats.profitToday >= 0 ? "text-green-600" : "text-red-600"} subtext="Thực thu - Vốn hàng" />
              <StatCard label="Doanh thu (Thực thu)" value={formatCurrency(stats.revenueToday)} color="text-green-600" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Khách nợ (Phải thu)" value={formatCurrency(stats.receivables)} color="text-orange-500" />
              <StatCard label="Tổng chi" value={formatCurrency(stats.totalExpenseToday)} color="text-red-600" subtext="Nhập gà + chi phí khác (hôm nay)" />
            </div>
          </div>
        )}
      </Card>

      <Card className="p-0 overflow-hidden">
        <button onClick={() => setIsExpenseExpanded(prev => !prev)} className="w-full text-left p-4 hover:bg-gray-50 transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-gray-800">Chi phí khác</h3>
              <p className="text-xs text-gray-500 mt-1">Nhấn để mở form ghi nhận chi phí</p>
            </div>
            <span className="text-xs font-bold px-2 py-1 rounded bg-yellow-50 text-yellow-700 border border-yellow-200">{isExpenseExpanded ? 'Thu gọn ▲' : 'Mở rộng ▼'}</span>
          </div>
        </button>

        {isExpenseExpanded && (
          <div className="border-t border-gray-100 p-4 bg-gray-50">
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <Select
                  label="Nhóm chi"
                  value={otherExpenseCategory}
                  onChange={(e: any) => setOtherExpenseCategory(e.target.value)}
                  options={[
                    { value: 'Cám', label: 'Cám gà' },
                    { value: 'Bắp', label: 'Bắp' },
                    { value: 'Xăng dầu', label: 'Xăng dầu xe' },
                    { value: 'Vật tư', label: 'Vật tư khác' },
                    { value: 'Khác', label: 'Khác' },
                  ]}
                />
              </div>
              <Input label="Số tiền" type="number" value={otherExpenseAmount} onChange={(e: any) => setOtherExpenseAmount(e.target.value)} placeholder="0" />
              <Input label="Ghi chú" value={otherExpenseNote} onChange={(e: any) => setOtherExpenseNote(e.target.value)} placeholder="Tuỳ chọn" />
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <Button variant="secondary" onClick={() => navigate('cash')} className="w-full">Mở Sổ quỹ</Button>
              <Button className="w-full" variant="danger" onClick={handleCreateOtherExpense} disabled={isSavingExpense}>{isSavingExpense ? 'Đang lưu...' : '+ Ghi nhận chi phí'}</Button>
            </div>
          </div>
        )}
      </Card>

      <Card title="Phím tắt">
        <div className="grid grid-cols-2 gap-3">
          <Button onClick={() => navigate('pos')} variant="primary" className="flex justify-center items-center gap-2">
            <ICONS.Plus /> Bán Hàng
          </Button>
          <Button onClick={() => navigate('import')} variant="secondary" className="flex justify-center items-center gap-2">
            <ICONS.Inventory /> Nhập Hàng
          </Button>
        </div>
      </Card>

      <div className="mb-2">
        <div className="flex justify-between items-center mb-2">
          <h3 className="font-bold text-gray-700">Đơn đặt hàng</h3>
          <button onClick={() => handleOpenOrderModal()} className="text-sm bg-brand-600 text-white px-3 py-1 rounded-lg shadow font-medium">+ Thêm</button>
        </div>
        <div className="flex gap-2 mb-2">
          <button
            onClick={() => setOrderView('PENDING')}
            className={`px-3 py-1 rounded-full text-xs font-bold border ${orderView === 'PENDING' ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-300'}`}
          >
            Chờ chuẩn bị ({preOrders.filter(p => p.status === 'PENDING').length})
          </button>
          <button
            onClick={() => setOrderView('PREPARED')}
            className={`px-3 py-1 rounded-full text-xs font-bold border ${orderView === 'PREPARED' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-300'}`}
          >
            Chuẩn bị xong ({preOrders.filter(p => p.status === 'PREPARED').length})
          </button>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-2 space-y-2 min-h-[60px]">
          {preOrders.filter(po => po.status === orderView).length === 0 ? (
            <div className="text-center text-gray-400 text-sm italic py-2">Chưa có đơn đặt hàng nào</div>
          ) : (
            preOrders.filter(po => po.status === orderView).map(po => (
              <div
                key={po.id}
                onDoubleClick={() => handleOpenOrderModal(po)}
                className="bg-white border border-yellow-100 p-3 rounded-lg shadow-sm flex items-center justify-between cursor-pointer hover:bg-yellow-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="bg-yellow-100 text-yellow-800 font-bold px-2 py-1 rounded text-xs text-center min-w-[50px]">
                    {formatTime(po.deliveryTime)} <br />
                    <span className="font-normal text-[10px]">{formatDateShort(po.deliveryTime)}</span>
                  </div>
                  <div>
                    <div className="font-bold text-gray-800">{po.customerName}</div>
                    <div className="text-xs text-gray-500">{po.productNote} {po.qtyCon ? `(${po.qtyCon} con)` : ''}</div>
                    <div className="text-[10px] mt-1 inline-flex px-2 py-0.5 rounded-full font-bold border border-gray-200 text-gray-600 bg-gray-50">
                      {po.status === 'PREPARED' ? 'Đã chuẩn bị - chờ giao' : 'Chờ chuẩn bị'}
                    </div>
                  </div>
                </div>
                <div className="text-gray-300"><ICONS.Plus /></div>
              </div>
            ))
          )}
        </div>
      </div>

      <Modal isOpen={isOrderModalOpen} onClose={() => setIsOrderModalOpen(false)} title={selectedOrder ? 'Chi tiết đặt hàng' : 'Thêm đơn đặt hàng'}>
        <div className="space-y-4">
          <Select
            label="Chọn nhanh khách đã lưu"
            value=""
            onChange={(e: any) => handleSelectSuggestedCustomer(e.target.value)}
            options={[
              { value: '', label: '-- Chọn khách hàng --' },
              ...customerOptions.map(c => ({ value: `partner:${c.id}`, label: `${c.name}${c.phone ? ` - ${c.phone}` : ''}` })),
              ...filteredQuickCustomerOptions.map(c => ({ value: `quick:${encodeURIComponent(c.name)}::${encodeURIComponent(c.phone || '')}`, label: `${c.name}${c.phone ? ` - ${c.phone}` : ''} (nhập tay)` }))
            ]}
          />
          {filteredQuickCustomerOptions.length > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-2 -mt-2">
              <div className="text-[11px] text-gray-500 font-bold uppercase mb-2">Xoá nhanh khách nhập tay</div>
              <div className="flex flex-wrap gap-2">
                {filteredQuickCustomerOptions.map((c, idx) => (
                  <button
                    key={`${c.name}-${c.phone || ''}-${idx}`}
                    type="button"
                    onClick={() => handleDeleteQuickCustomer(c.name, c.phone)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-white border border-gray-200 text-gray-700 hover:bg-red-50 hover:border-red-200 hover:text-red-600"
                  >
                    <span>{c.name}{c.phone ? ` - ${c.phone}` : ''}</span>
                    <span>✕</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <Input label="Tên khách hàng" value={poName} onChange={(e: any) => setPoName(e.target.value)} />
          <Input label="Số điện thoại" value={poPhone} onChange={(e: any) => setPoPhone(e.target.value)} type="tel" />
          <Input label="Thời gian giao" type="datetime-local" value={poTime} onChange={(e: any) => setPoTime(e.target.value)} />
          <div className="border-t border-gray-200 pt-2">
            <Select
              label="Chọn nhanh loại gà / hàng"
              value=""
              onChange={(e: any) => handleSelectSuggestedProduct(e.target.value)}
              options={[
                { value: '', label: '-- Chọn mặt hàng --' },
                ...productOptions.map(p => ({ value: p.id, label: p.name })),
                ...manualGoodsOptions.map(name => ({ value: name, label: `${name} (đã dùng)` }))
              ]}
            />
            <Input label="Loại gà / Hàng hoá" value={poProduct} onChange={(e: any) => setPoProduct(e.target.value)} />
            <div className="flex gap-2 mt-2">
              <div className="flex-1"><Input label="Số con" type="number" value={poCon} onChange={(e: any) => setPoCon(e.target.value)} /></div>
              <div className="flex-1"><Input label="Số Kg" type="number" value={poKg} onChange={(e: any) => setPoKg(e.target.value)} /></div>
            </div>
            <Input label="Đơn giá" type="number" value={poPrice} onChange={(e: any) => setPoPrice(e.target.value)} placeholder="VND / kg hoặc con" className="mt-2" />
          </div>
          <textarea className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white" value={poNote} onChange={e => setPoNote(e.target.value)} placeholder="Ghi chú..." />
          {showDeliveryPayment && (
            <div className="border border-blue-100 bg-blue-50 rounded-lg p-3 space-y-3">
              <div className="text-xs font-bold text-blue-800 uppercase">Thanh toán giao hàng</div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => { setDeliveryPaymentMethod(PaymentMethod.CASH); setDeliveryPaidAmount(draftTotal); }}
                  className={`py-2 text-xs font-bold rounded border ${deliveryPaymentMethod === PaymentMethod.CASH ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-300'}`}
                >Tiền mặt</button>
                <button
                  type="button"
                  onClick={() => { setDeliveryPaymentMethod(PaymentMethod.TRANSFER); setDeliveryPaidAmount(draftTotal); }}
                  className={`py-2 text-xs font-bold rounded border ${deliveryPaymentMethod === PaymentMethod.TRANSFER ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'}`}
                >Chuyển khoản</button>
                <button
                  type="button"
                  onClick={() => { setDeliveryPaymentMethod(PaymentMethod.DEBT); setDeliveryPaidAmount(0); }}
                  className={`py-2 text-xs font-bold rounded border ${deliveryPaymentMethod === PaymentMethod.DEBT ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-600 border-gray-300'}`}
                >Ghi nợ</button>
              </div>
              <div className="text-xs text-gray-600">Tổng đơn: <span className="font-bold text-brand-600">{formatCurrency(draftTotal)}</span></div>
              <Input
                label="Khách trả"
                type="number"
                value={deliveryPaidAmount}
                onChange={(e: any) => setDeliveryPaidAmount(Number(e.target.value))}
                disabled={deliveryPaymentMethod === PaymentMethod.DEBT}
              />
              {deliveryPaymentMethod === PaymentMethod.TRANSFER && (
                <div className="bg-white border border-blue-100 rounded-lg p-2 text-center">
                  {bankSettings && deliveryQrLink ? (
                    <>
                      <div className="text-xs text-blue-800 font-semibold mb-2">Quét mã để chuyển khoản</div>
                      <img src={deliveryQrLink} alt="VietQR" className="mx-auto h-36 object-contain bg-white p-1 rounded" />
                      <div className="mt-2 text-xs text-gray-600">
                        <div className="font-bold">{bankSettings.accountName}</div>
                        <div>{bankSettings.accountNo} - {bankSettings.bankId}</div>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-sm text-red-500">Chưa cấu hình tài khoản ngân hàng hợp lệ trong Sổ Quỹ.</div>
                      <Button variant="secondary" onClick={() => navigate('cash')} className="w-full">Mở Sổ quỹ để cấu hình QR</Button>
                    </div>
                  )}
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={handleDownloadDeliveryQr}
                      disabled={!deliveryQrLink}
                      className="w-full py-2 text-xs font-bold rounded border border-blue-600 bg-blue-600 text-white disabled:bg-gray-200 disabled:text-gray-500 disabled:border-gray-300"
                    >
                      Tải QR
                    </button>
                    <button
                      type="button"
                      onClick={handleOpenDeliveryQrFullscreen}
                      disabled={!deliveryQrLink}
                      className="w-full py-2 text-xs font-bold rounded border border-blue-600 bg-white text-blue-700 disabled:bg-gray-200 disabled:text-gray-500 disabled:border-gray-300"
                    >
                      Mở QR toàn màn hình
                    </button>
                  </div>
                </div>
              )}
              <Button variant="success" className="w-full" onClick={handleDeliverSuccess}>Xác nhận giao hàng & xuất hoá đơn</Button>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            {selectedOrder ? (
              <>
                <Button variant="danger" className="flex-1" onClick={handleDeleteOrder}>Xoá</Button>
                {selectedOrder.status !== 'PREPARED' && (
                  <Button variant="secondary" className="flex-1" onClick={handleMarkPreparedOrder}>Chuẩn bị xong</Button>
                )}
                <Button variant="success" className="flex-1" onClick={() => setShowDeliveryPayment(prev => !prev)}>Giao hàng thành công</Button>
                <Button className="flex-1" onClick={handleSaveOrder}>Lưu Sửa</Button>
              </>
            ) : <Button className="w-full" onClick={handleSaveOrder}>Lưu Đơn Đặt</Button>}
          </div>
        </div>
      </Modal>

      {isDeliveryQrPreviewOpen && deliveryQrLink && (
        <div className="fixed inset-0 z-[70] bg-black/85 flex flex-col">
          <div className="flex items-center justify-between p-4 text-white">
            <div className="font-bold">QR chuyển khoản giao hàng</div>
            <button
              onClick={() => setIsDeliveryQrPreviewOpen(false)}
              className="px-3 py-1 rounded border border-white/40 text-sm"
            >
              Đóng
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center p-4">
            <img src={deliveryQrLink} alt="VietQR delivery fullscreen" className="max-h-full max-w-full object-contain bg-white rounded-lg p-2" />
          </div>
        </div>
      )}

      <div className="fixed right-4 bottom-24 z-40">
        {isAiChatOpen && (
          <div className="mb-3 w-[320px] max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden">
            <div className="px-3 py-2 bg-brand-600 text-white flex items-center justify-between">
              <div className="text-sm font-bold">AI hỗ trợ</div>
              <div className="flex items-center gap-2">
                <select
                  value={aiModel}
                  onChange={(e: any) => setAiModel(e.target.value as GeminiModel)}
                  className="text-[11px] bg-white text-gray-700 rounded px-1.5 py-1 max-w-[125px]"
                >
                  {geminiModels.map(model => <option key={model} value={model}>{model}</option>)}
                </select>
                <button onClick={() => setIsAiChatOpen(false)} className="text-xs bg-white/20 px-2 py-1 rounded">Đóng</button>
              </div>
            </div>

            <div className="p-3 border-b border-gray-100">
              <div className="text-[11px] uppercase font-bold text-gray-500 mb-2">Lối tắt</div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => handleAiShortcut('PRICE')} className="text-xs px-2 py-1 rounded-full border border-gray-300 bg-gray-50 text-gray-700">Giá bán</button>
                <button onClick={() => handleAiShortcut('ANOMALY')} className="text-xs px-2 py-1 rounded-full border border-gray-300 bg-gray-50 text-gray-700">Bất thường</button>
                <button onClick={() => { setForecastDays(7); handleAiShortcut('FORECAST_7'); }} className="text-xs px-2 py-1 rounded-full border border-gray-300 bg-gray-50 text-gray-700">Dự báo 7 ngày</button>
                <button onClick={() => { setForecastDays(30); handleAiShortcut('FORECAST_30'); }} className="text-xs px-2 py-1 rounded-full border border-gray-300 bg-gray-50 text-gray-700">Dự báo 30 ngày</button>
                <button onClick={handleShowApiKeyGuide} className="text-xs px-2 py-1 rounded-full border border-indigo-300 bg-indigo-50 text-indigo-700">Hướng dẫn lấy API key</button>
                <button onClick={handleStartSetApiKey} className="text-xs px-2 py-1 rounded-full border border-emerald-300 bg-emerald-50 text-emerald-700">Set API key</button>
                <button onClick={handleCheckGemini} className="text-xs px-2 py-1 rounded-full border border-blue-300 bg-blue-50 text-blue-700">Kiểm tra kết nối Gemini</button>
              </div>
              <div className="mt-2 text-[11px] text-gray-500">
                Thu/Chi {forecastDays} ngày: <span className="font-bold text-green-700">{formatCurrency(cashflowForecast.expectedIn)}</span> / <span className="font-bold text-red-700">{formatCurrency(cashflowForecast.expectedOut)}</span>
              </div>
            </div>

            <div ref={aiMessagesRef} className="max-h-56 overflow-y-auto p-3 space-y-2 bg-gray-50">
              {aiMessages.map((message, idx) => (
                <div
                  key={idx}
                  className={`text-xs rounded-lg px-3 py-2 whitespace-pre-line ${message.role === 'user' ? 'bg-brand-600 text-white ml-8' : 'bg-white border border-gray-200 text-gray-700 mr-8'}`}
                >
                  {message.text}
                </div>
              ))}
              {isAskingAi && (
                <div className="text-xs rounded-lg px-3 py-2 whitespace-pre-line bg-white border border-gray-200 text-gray-500 mr-8">
                  Đang phân tích với {aiModel}...
                </div>
              )}
            </div>

            <div className="p-3 border-t border-gray-100 flex gap-2">
              <Input className="flex-1" placeholder="Ví dụ: Hôm nay lãi/lỗ vì sao?" value={aiQuestion} onChange={(e: any) => setAiQuestion(e.target.value)} />
              <Button onClick={handleAskAI} disabled={isAskingAi}>{isAskingAi ? 'Đang gửi...' : 'Gửi'}</Button>
            </div>
          </div>
        )}

        <button
          onClick={() => setIsAiChatOpen(prev => !prev)}
          className="w-14 h-14 rounded-full bg-brand-600 text-white shadow-xl border-4 border-white flex items-center justify-center text-xl"
          title="Mở AI hỗ trợ"
        >
          💬
        </button>
      </div>
    </div>
  );
}
