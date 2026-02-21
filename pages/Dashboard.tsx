import React, { useEffect, useRef, useState } from 'react';
import { db } from '../services/db';
import { DashboardStats, PartnerType, PreOrder, Unit, PaymentMethod, BankSettings } from '../types';
import { aiService, GeminiModel, type ExtractedPreOrderData } from '../services/ai';
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
  const [deliveryLaborFee, setDeliveryLaborFee] = useState(0);
  const [isDeliveryQrPreviewOpen, setIsDeliveryQrPreviewOpen] = useState(false);
  const [isAiChatOpen, setIsAiChatOpen] = useState(false);
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiMessages, setAiMessages] = useState<Array<{ role: 'user' | 'ai'; text: string }>>([
    { role: 'ai', text: 'Xin chào! Mình có thể gợi ý giá bán, phát hiện nhập liệu bất thường và trả lời nhanh theo dữ liệu nội bộ.' }
  ]);
  const [isAskingAi, setIsAskingAi] = useState(false);
  const [aiModel, setAiModel] = useState<GeminiModel>('gemini-2.5-flash');
  const [isAwaitingApiKeyInput, setIsAwaitingApiKeyInput] = useState(false);
  const [isAiShortcutMenuOpen, setIsAiShortcutMenuOpen] = useState(false);
  const aiMessagesRef = useRef<HTMLDivElement | null>(null);
  const captureOrderImageRef = useRef<HTMLInputElement | null>(null);
  const uploadOrderImageRef = useRef<HTMLInputElement | null>(null);
  const [isExtractingOrderImage, setIsExtractingOrderImage] = useState(false);
  const [isAiOrderReviewOpen, setIsAiOrderReviewOpen] = useState(false);
  const [aiOrderDraft, setAiOrderDraft] = useState<ExtractedPreOrderData | null>(null);
  const [aiOrderSourceName, setAiOrderSourceName] = useState('');

  const customerOptions = db.getPartners(PartnerType.CUSTOMER);
  const productOptions = db.getProducts();
  const manualGoodsOptions = Array.from(new Set([
    ...db.getInvoices()
      .flatMap(inv => inv.lines || [])
      .filter(line => line.productId === 'MANUAL' && !!line.productName)
      .map(line => line.productName.trim())
      .filter(Boolean),
    ...db.getQuickItems()
  ]));
  const geminiModels = aiService.getGeminiModels();
  const bankSettings: BankSettings | null = db.getBankSettings();
  const draftBaseTotal = (Number(poKg) > 0 ? Number(poKg) : Number(poCon)) * ((Number(poPrice) || 0) * 1000);
  const draftTotal = draftBaseTotal + (Number(deliveryLaborFee) || 0);
  const isDeliveryTotalLowerThanActual = draftTotal < draftBaseTotal;
  const autoDeliveryKg = Number(poKg) || 0;
  const autoDeliveryPrice = (Number(poPrice) || 0) * 1000;
  const dynamicDeliveryWarning = `Đơn giá chính xác là số_kg(${autoDeliveryKg.toFixed(3)}kg) x đơn_giá(${formatCurrency(autoDeliveryPrice)}) = tổng_tiền(${formatCurrency(draftBaseTotal)}), hãy cân nhắc kỹ.`;

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

  useEffect(() => {
    if (!showDeliveryPayment) return;
    if (deliveryPaymentMethod === PaymentMethod.DEBT) return;

    const paid = Number(draftTotal) || 0;
    const laborFee = Number(deliveryLaborFee) || 0;
    const unitPrice = (Number(poPrice) || 0) * 1000;
    const qtyCon = Number(poCon) || 0;
    const qtyKg = Number(poKg) || 0;
    const netChickenAmount = paid - laborFee;

    if (qtyCon > 0 || qtyKg > 0 || netChickenAmount <= 0 || unitPrice <= 0) return;

    const inferredKg = netChickenAmount / unitPrice;
    setPoKg(inferredKg.toFixed(3).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1'));
  }, [showDeliveryPayment, deliveryPaymentMethod, draftTotal, deliveryLaborFee, poPrice, poCon, poKg]);

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
      setPoPrice(order.unitPrice ? String((order.unitPrice || 0) / 1000) : '');
      setPoTime(order.deliveryTime); setPoNote(order.note || '');
      setDeliveryPaymentMethod(PaymentMethod.CASH);
      setDeliveryLaborFee(0);
    } else {
      setSelectedOrder(null); setPoName(''); setPoPhone(''); setPoProduct(''); setPoCon(''); setPoKg('');
      setPoPrice('');
      const now = new Date(); now.setHours(now.getHours() + 1); now.setMinutes(0); setPoTime(now.toISOString().slice(0, 16)); setPoNote('');
      setDeliveryPaymentMethod(PaymentMethod.CASH);
      setDeliveryLaborFee(0);
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
      unitPrice: (Number(poPrice) || 0) * 1000,
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
      if (quickPrice > 0 && !poPrice) setPoPrice(String(quickPrice / 1000));
      db.saveQuickItem(foundProduct.name);
      return;
    }
    setPoProduct(value);
    db.saveQuickItem(value);
  };

  const handleAutoFillPhoneByName = (customerName: string) => {
    const name = (customerName || '').trim().toLowerCase();
    if (!name) return;

    const foundPartner = customerOptions.find(c => (c.name || '').trim().toLowerCase() === name);
    if (foundPartner && foundPartner.phone) {
      setPoPhone(foundPartner.phone);
      return;
    }

    const foundQuick = quickCustomerOptions.find(c => (c.name || '').trim().toLowerCase() === name);
    if (foundQuick && foundQuick.phone) {
      setPoPhone(foundQuick.phone);
    }
  };

  const handleSaveCurrentCustomerQuick = () => {
    if (!poName.trim()) return alert('Vui lòng nhập tên khách hàng trước khi thêm.');
    db.saveQuickCustomer(poName.trim(), poPhone.trim());
    setQuickCustomerOptions(db.getQuickCustomers());
  };

  const handleSaveCurrentProductQuick = () => {
    if (!poProduct.trim()) return alert('Vui lòng nhập tên hàng hoá trước khi thêm.');
    db.saveQuickItem(poProduct.trim());
  };

  const toDateTimeLocalValue = (isoText: string) => {
    const parsed = new Date(isoText || '');
    if (isNaN(parsed.getTime())) return '';
    const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  };

  const priceToInputThousand = (priceVnd: number) => {
    const thousand = (Number(priceVnd) || 0) / 1000;
    if (thousand <= 0) return '';
    return thousand.toFixed(3).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
  };

  const applyAiOrderDraftToForm = (draft: ExtractedPreOrderData) => {
    setPoName(draft.customerName || '');
    setPoPhone(draft.phone || '');
    setPoProduct(draft.productNote || '');
    setPoCon(String(Number(draft.qtyCon) || 0));
    setPoKg(draft.qtyKg > 0 ? String(Number(draft.qtyKg) || 0) : '');
    setPoPrice(priceToInputThousand(draft.unitPrice || 0));
    setPoTime(draft.deliveryTime ? toDateTimeLocalValue(draft.deliveryTime) : poTime);
    setPoNote(draft.note || '');
    if (draft.customerName || draft.phone) {
      db.saveQuickCustomer((draft.customerName || '').trim(), (draft.phone || '').trim());
      setQuickCustomerOptions(db.getQuickCustomers());
    }
    if (draft.productNote) {
      db.saveQuickItem((draft.productNote || '').trim());
    }
  };

  const fileToBase64 = (file: File) => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        if (!base64) {
          reject(new Error('Không đọc được dữ liệu ảnh.'));
          return;
        }
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('Không thể đọc file ảnh.'));
      reader.readAsDataURL(file);
    });
  };

  const handleOpenOrderCamera = () => {
    captureOrderImageRef.current?.click();
  };

  const handleOpenOrderUpload = () => {
    uploadOrderImageRef.current?.click();
  };

  const handleAiOrderImageSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setIsExtractingOrderImage(true);
    setAiOrderSourceName(file.name || 'Ảnh đơn hàng');
    try {
      const base64 = await fileToBase64(file);
      const result = await aiService.extractPreOrderFromImage(base64, file.type || 'image/jpeg', aiModel);

      if (result.switchedModel && result.usedModel !== aiModel) {
        setAiModel(result.usedModel);
      }

      if (!result.data) {
        alert(`Không thể đọc dữ liệu từ ảnh. ${result.reason ? `Lý do: ${result.reason}` : ''}`.trim());
        return;
      }

      setAiOrderDraft(result.data);
      setIsAiOrderReviewOpen(true);
    } catch (e: any) {
      alert(e?.message || 'Không thể xử lý ảnh đơn hàng.');
    } finally {
      setIsExtractingOrderImage(false);
    }
  };

  const updateAiOrderDraftField = (field: keyof ExtractedPreOrderData, value: any) => {
    setAiOrderDraft(prev => {
      if (!prev) return prev;
      return { ...prev, [field]: value };
    });
  };

  const handleApplyAiOrderDraft = () => {
    if (!aiOrderDraft) return;
    applyAiOrderDraftToForm(aiOrderDraft);
    setIsAiOrderReviewOpen(false);
  };

  const handleDeliverSuccess = async () => {
    if (!selectedOrder) return;

    const qtyCon = Number(poCon) || 0;
    const qtyKg = Number(poKg) || 0;
    const unitPrice = (Number(poPrice) || 0) * 1000;
    const laborFee = Number(deliveryLaborFee) || 0;
    const orderTotal = ((qtyKg > 0 ? qtyKg : qtyCon) * unitPrice) + laborFee;

    if (!poName || !poProduct || !poTime) return alert('Vui lòng nhập đủ khách hàng, hàng hoá và thời gian giao.');
    if (qtyCon <= 0 && qtyKg <= 0) return alert('Cần nhập ít nhất Số con hoặc Số kg.');
    if (unitPrice <= 0) return alert('Vui lòng nhập đơn giá hợp lệ để xuất hoá đơn.');

    if (isDeliveryTotalLowerThanActual) {
      const ok = window.confirm(`${dynamicDeliveryWarning} Bạn vẫn muốn lưu đơn với tổng khách phải trả nhỏ hơn tổng thực tế?`);
      if (!ok) return;
    }

    const paidAmount = deliveryPaymentMethod === PaymentMethod.DEBT ? 0 : orderTotal;

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

    const saleLines = [saleLine];
    if (laborFee !== 0) {
      saleLines.push({
        productId: 'MANUAL',
        productName: laborFee > 0 ? 'Tiền công' : 'Giảm trừ',
        qtyCon: 1,
        qtyKg: 0,
        unit: Unit.CON,
        price: laborFee,
        gender: 'MALE'
      } as any);
    }

    try {
      db.saveQuickCustomer(poName, poPhone);
      db.saveQuickItem(poProduct);
      setQuickCustomerOptions(db.getQuickCustomers());
      await db.createSale(customer.id, poTime.split('T')[0], saleLines, paidAmount, deliveryPaymentMethod);
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
      setDeliveryLaborFee(0);
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
    const transferAmount = Math.max(0, Number(draftTotal) || 0);
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
  const deliveryQrLink = getDeliveryQrLink();
  const customerSuggestions = Array.from(new Set([
    ...customerOptions.map(c => (c.name || '').trim()).filter(Boolean),
    ...quickCustomerOptions.map(c => (c.name || '').trim()).filter(Boolean)
  ]));
  const productSuggestions = Array.from(new Set([
    ...productOptions.map(p => (p.name || '').trim()).filter(Boolean),
    ...manualGoodsOptions.map(name => (name || '').trim()).filter(Boolean)
  ]));

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
        <div className="p-4 flex justify-center">
          <button
            onClick={handleSalesMenuClick}
            className={`text-sm font-black uppercase tracking-wide px-5 py-3 rounded-lg border shadow-md hover:shadow-lg transition-all ${isSalesUnlocked ? 'bg-blue-700 text-white border-blue-800' : 'bg-blue-600 text-white border-blue-700 hover:bg-blue-700'}`}
          >
            QUẢN LÝ DOANH THU NGÀY
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
        <div className="p-4 flex justify-center">
          <button
            onClick={() => setIsExpenseExpanded(prev => !prev)}
            className={`text-sm font-black uppercase tracking-wide px-5 py-3 rounded-lg border shadow-md hover:shadow-lg transition-all ${isExpenseExpanded ? 'bg-brand-700 text-white border-brand-800' : 'bg-brand-600 text-white border-brand-700 hover:bg-brand-700'}`}
          >
            NHẬP CHI PHÍ KHÁC
          </button>
        </div>

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
          <div className="border border-brand-100 rounded-lg p-3 bg-brand-50/50">
            <div className="text-xs font-bold text-brand-700 mb-2">AI nhập đơn từ ảnh</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleOpenOrderCamera}
                disabled={isExtractingOrderImage}
                className="py-2 text-xs font-bold rounded border border-brand-600 bg-brand-600 text-white disabled:bg-gray-200 disabled:text-gray-500 disabled:border-gray-300"
              >
                {isExtractingOrderImage ? 'Đang đọc...' : '📷 Chụp ảnh'}
              </button>
              <button
                type="button"
                onClick={handleOpenOrderUpload}
                disabled={isExtractingOrderImage}
                className="py-2 text-xs font-bold rounded border border-brand-600 bg-white text-brand-700 disabled:bg-gray-200 disabled:text-gray-500 disabled:border-gray-300"
              >
                Tải ảnh lên
              </button>
            </div>
            <div className="text-[11px] text-gray-600 mt-2">AI sẽ phân tích và hiển thị bảng xác nhận trước khi cập nhật form.</div>
            <input
              ref={captureOrderImageRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleAiOrderImageSelected}
            />
            <input
              ref={uploadOrderImageRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAiOrderImageSelected}
            />
          </div>

          <div>
            <label className="text-sm font-bold text-gray-700 mb-1 block">Tên khách hàng</label>
            <div className="flex gap-2">
              <input
                list="customer-suggestion-list"
                value={poName}
                onChange={(e: any) => {
                  setPoName(e.target.value);
                  handleAutoFillPhoneByName(e.target.value);
                }}
                placeholder="Nhập hoặc chọn khách đã lưu"
                className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button
                type="button"
                onClick={handleSaveCurrentCustomerQuick}
                className="px-3 py-2 rounded-lg border border-brand-600 bg-brand-600 text-white font-bold"
                title="Thêm nhanh khách hàng"
              >
                +
              </button>
            </div>
            <datalist id="customer-suggestion-list">
              {customerSuggestions.map((name, idx) => (
                <option key={`${name}-${idx}`} value={name} />
              ))}
            </datalist>
          </div>
          <Input label="Số điện thoại" value={poPhone} onChange={(e: any) => setPoPhone(e.target.value)} type="tel" />
          <Input label="Thời gian giao" type="datetime-local" value={poTime} onChange={(e: any) => setPoTime(e.target.value)} />
          <div className="border-t border-gray-200 pt-2">
            <div>
              <label className="text-sm font-bold text-gray-700 mb-1 block">Loại gà / Hàng hoá</label>
              <div className="flex gap-2">
                <input
                  list="product-suggestion-list"
                  value={poProduct}
                  onChange={(e: any) => {
                    setPoProduct(e.target.value);
                    handleSelectSuggestedProduct(e.target.value);
                  }}
                  placeholder="Nhập hoặc chọn hàng đã lưu"
                  className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <button
                  type="button"
                  onClick={handleSaveCurrentProductQuick}
                  className="px-3 py-2 rounded-lg border border-brand-600 bg-brand-600 text-white font-bold"
                  title="Thêm nhanh hàng hoá"
                >
                  +
                </button>
              </div>
              <datalist id="product-suggestion-list">
                {productSuggestions.map((name, idx) => (
                  <option key={`${name}-${idx}`} value={name} />
                ))}
              </datalist>
            </div>
            <div className="flex gap-2 mt-2">
              <div className="flex-1"><Input label="Số con" type="number" value={poCon} onChange={(e: any) => setPoCon(e.target.value)} /></div>
              <div className="flex-1"><Input label="Số Kg" type="number" value={poKg} onChange={(e: any) => setPoKg(e.target.value)} /></div>
            </div>
            <Input label="Đơn giá (nghìn VND/kg hoặc con)" type="number" value={poPrice} onChange={(e: any) => setPoPrice(e.target.value)} placeholder="VD: 95" className="mt-2" />
          </div>
          <textarea className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white" value={poNote} onChange={e => setPoNote(e.target.value)} placeholder="Ghi chú..." />
          {showDeliveryPayment && (
            <div className="border border-blue-100 bg-blue-50 rounded-lg p-3 space-y-3">
              <div className="text-xs font-bold text-blue-800 uppercase">Thanh toán giao hàng</div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => { setDeliveryPaymentMethod(PaymentMethod.CASH); }}
                  className={`py-2 text-xs font-bold rounded border ${deliveryPaymentMethod === PaymentMethod.CASH ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-300'}`}
                >Tiền mặt</button>
                <button
                  type="button"
                  onClick={() => { setDeliveryPaymentMethod(PaymentMethod.TRANSFER); }}
                  className={`py-2 text-xs font-bold rounded border ${deliveryPaymentMethod === PaymentMethod.TRANSFER ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'}`}
                >Chuyển khoản</button>
                <button
                  type="button"
                  onClick={() => { setDeliveryPaymentMethod(PaymentMethod.DEBT); }}
                  className={`py-2 text-xs font-bold rounded border ${deliveryPaymentMethod === PaymentMethod.DEBT ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-600 border-gray-300'}`}
                >Ghi nợ</button>
              </div>
              <div className="text-xs text-gray-600">Tiền gà: <span className="font-bold text-gray-700">{formatCurrency(draftBaseTotal)}</span></div>
              <Input
                label="Tiền công"
                type="number"
                value={deliveryLaborFee}
                onChange={(e: any) => setDeliveryLaborFee(Number(e.target.value) || 0)}
              />
              <Input
                label="Tổng khách phải trả"
                type="number"
                value={draftTotal}
                onChange={(e: any) => {
                  const totalCustomerPay = Number(e.target.value) || 0;
                  setDeliveryLaborFee(totalCustomerPay - draftBaseTotal);
                }}
              />
              {isDeliveryTotalLowerThanActual && (
                <div className="text-[11px] text-orange-600 font-semibold -mt-1">
                  ⚠ {dynamicDeliveryWarning}
                </div>
              )}
              {deliveryPaymentMethod !== PaymentMethod.DEBT && Number(poCon) <= 0 && Number(draftTotal) > 0 && Number(poPrice) > 0 && (
                <div className="text-xs text-gray-600 -mt-1">
                  Tự tính khối lượng: {Math.max(0, ((Number(draftTotal) || 0) - (Number(deliveryLaborFee) || 0)) / ((Number(poPrice) || 0) * 1000)).toFixed(3)} kg
                </div>
              )}
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

      <Modal isOpen={isAiOrderReviewOpen} onClose={() => setIsAiOrderReviewOpen(false)} title="Xác nhận dữ liệu AI">
        <div className="space-y-3">
          <div className="text-xs text-gray-500">Nguồn ảnh: {aiOrderSourceName || 'Ảnh vừa chọn'}</div>
          <Input
            label="Khách hàng"
            value={aiOrderDraft?.customerName || ''}
            onChange={(e: any) => updateAiOrderDraftField('customerName', e.target.value)}
          />
          <Input
            label="Số điện thoại"
            type="tel"
            value={aiOrderDraft?.phone || ''}
            onChange={(e: any) => updateAiOrderDraftField('phone', e.target.value)}
          />
          <Input
            label="Thời gian giao"
            type="datetime-local"
            value={toDateTimeLocalValue(aiOrderDraft?.deliveryTime || '')}
            onChange={(e: any) => updateAiOrderDraftField('deliveryTime', e.target.value ? new Date(e.target.value).toISOString() : '')}
          />
          <Input
            label="Loại gà / Hàng hoá"
            value={aiOrderDraft?.productNote || ''}
            onChange={(e: any) => updateAiOrderDraftField('productNote', e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Số con"
              type="number"
              value={aiOrderDraft?.qtyCon ?? 0}
              onChange={(e: any) => updateAiOrderDraftField('qtyCon', Math.max(0, Number(e.target.value) || 0))}
            />
            <Input
              label="Số Kg"
              type="number"
              value={aiOrderDraft?.qtyKg ?? 0}
              onChange={(e: any) => updateAiOrderDraftField('qtyKg', Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
          <Input
            label="Đơn giá (VND)"
            type="number"
            value={aiOrderDraft?.unitPrice ?? 0}
            onChange={(e: any) => updateAiOrderDraftField('unitPrice', Math.max(0, Number(e.target.value) || 0))}
          />
          <Input
            label="Độ tin cậy (0-1)"
            type="number"
            value={aiOrderDraft?.confidence ?? 0}
            onChange={(e: any) => updateAiOrderDraftField('confidence', Math.max(0, Math.min(1, Number(e.target.value) || 0)))}
          />
          <textarea
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
            value={aiOrderDraft?.note || ''}
            onChange={(e) => updateAiOrderDraftField('note', e.target.value)}
            placeholder="Ghi chú"
          />
          {Array.isArray(aiOrderDraft?.warnings) && aiOrderDraft!.warnings.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded p-2">
              <div className="text-xs font-bold text-yellow-800 mb-1">Cảnh báo AI</div>
              <ul className="text-xs text-yellow-700 list-disc pl-4 space-y-1">
                {aiOrderDraft!.warnings.map((warning, idx) => <li key={`${warning}-${idx}`}>{warning}</li>)}
              </ul>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <Button variant="secondary" className="flex-1" onClick={() => setIsAiOrderReviewOpen(false)}>Đóng</Button>
            <Button className="flex-1" onClick={handleApplyAiOrderDraft}>Cập nhật vào form</Button>
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
          <div className="mb-3 w-[390px] sm:w-[440px] max-w-[calc(100vw-0.75rem)] bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden">
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
              <button
                type="button"
                onClick={() => setIsAiShortcutMenuOpen(prev => !prev)}
                className="w-full flex items-center justify-between text-xs font-bold text-gray-700 border border-gray-300 bg-gray-50 rounded-lg px-3 py-2"
              >
                <span>Lối tắt</span>
                <span>{isAiShortcutMenuOpen ? '▲' : '▼'}</span>
              </button>
              {isAiShortcutMenuOpen && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button onClick={handleShowApiKeyGuide} className="text-xs px-2 py-1 rounded-full border border-indigo-300 bg-indigo-50 text-indigo-700">Hướng dẫn lấy API key</button>
                  <button onClick={handleStartSetApiKey} className="text-xs px-2 py-1 rounded-full border border-emerald-300 bg-emerald-50 text-emerald-700">Set API key</button>
                  <button onClick={handleCheckGemini} className="text-xs px-2 py-1 rounded-full border border-blue-300 bg-blue-50 text-blue-700">Kiểm tra kết nối Gemini</button>
                </div>
              )}
            </div>

            <div ref={aiMessagesRef} className="h-[340px] overflow-y-auto p-3 space-y-2 bg-gray-50">
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
