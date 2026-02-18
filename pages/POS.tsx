import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { Product, Partner, PartnerType, Unit, PaymentMethod, Batch, Gender } from '../types';
import { Button, Input, Select, Card, Modal } from '../components/ui';
import { formatCurrency, ICONS } from '../constants';

export default function POS({ navigate }: { navigate: (page: string) => void }) {
  const [saleGender, setSaleGender] = useState<'MALE'|'FEMALE'>('MALE');
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [customers, setCustomers] = useState<Partner[]>([]);
  
  // Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [cart, setCart] = useState<any[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [paidAmount, setPaidAmount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [useManualPrice, setUseManualPrice] = useState(false);

  // Add Item State
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [isManualItem, setIsManualItem] = useState(false); // New: Manual entry mode
  const [manualName, setManualName] = useState(''); // New: Manual name
  const [qtyKg, setQtyKg] = useState('');
  const [qtyCon, setQtyCon] = useState('');
  const [price, setPrice] = useState('');

  // Add Customer Modal
  const [isAddCustModalOpen, setIsAddCustModalOpen] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [isQrPreviewOpen, setIsQrPreviewOpen] = useState(false);

  useEffect(() => {
    setProducts(db.getProducts());
    setBatches(db.getBatches());
    loadCustomers();
  }, []);

  const bankSettings = db.getBankSettings();

  const loadCustomers = (selectId?: string) => {
    const custs = db.getPartners(PartnerType.CUSTOMER);
    setCustomers(custs);
    if (selectId) setSelectedCustomerId(selectId);
    else if (custs.length > 0 && !selectedCustomerId) setSelectedCustomerId(custs[0].id);
  }

  const handleAddCustomer = () => {
    if (!newCustName) return alert("Nhập tên khách");
    const newCust: Partner = {
      id: `c-${Date.now()}`,
      name: newCustName,
      phone: newCustPhone,
      type: PartnerType.CUSTOMER,
      debt: 0
    };
    db.savePartner(newCust);
    db.saveQuickCustomer(newCustName, newCustPhone);
    loadCustomers(newCust.id);
    setIsAddCustModalOpen(false);
    setNewCustName('');
    setNewCustPhone('');
  }

  const totalAmount = cart.reduce((sum, item) => sum + item.amount, 0);

  // Auto-update paidAmount when method changes
  useEffect(() => {
    if (paymentMethod === PaymentMethod.DEBT) {
      setPaidAmount(0);
    } else {
      setPaidAmount(totalAmount);
    }
  }, [paymentMethod, totalAmount]);

  const openProductModal = (prod: Product) => {
    setActiveProduct(prod);
    setIsManualItem(false);
    setSaleGender('MALE'); // Mặc định chọn Trống trước
    // Lấy giá Trống mặc định
    const defaultP = (prod.priceMale || 0) / 1000;
    setPrice(defaultP.toString());
    
    setQtyKg('');
    setQtyCon('');
    setUseManualPrice(false);
  };

  const openManualEntry = () => {
    setActiveProduct({ id: 'MANUAL', name: 'Hàng ngoài', priceMale: 0, priceFemale: 0, costMale: 0, costFemale: 0 }); // Dummy product
    setIsManualItem(true);
    setManualName('');
    setPrice('');
    setQtyKg('');
    setQtyCon('');
    setUseManualPrice(true);
  }

  const addToCart = () => {
    if (!activeProduct) return;

    const k = parseFloat(qtyKg) || 0;
    const c = parseFloat(qtyCon) || 0;
    const p = (parseFloat(price) || 0) * 1000;

    if (k === 0 && c === 0) {
      alert("Nhập số lượng Kg hoặc Con");
      return;
    }

    if (isManualItem && !manualName) {
        alert("Vui lòng nhập tên mặt hàng");
        return;
    }

    if (isManualItem) {
      db.saveQuickItem(manualName);
    } else if (activeProduct?.name) {
      db.saveQuickItem(activeProduct.name);
    }

    setCart([...cart, {
      productId: activeProduct.id,
      productName: isManualItem ? manualName : `${activeProduct.name} ${saleGender === 'MALE' ? '(Trống)' : '(Mái)'}`, // Thêm suffix tên cho dễ nhìn
      gender: saleGender, // <--- QUAN TRỌNG: Để DB biết trừ kho lô nào
      qtyKg: k,
      qtyCon: c,
      price: p,
      amount: k > 0 ? k * p : c * p, 
      unit: k > 0 ? Unit.KG : Unit.CON
    }]);

    setActiveProduct(null);
  };

  const removeFromCart = (index: number) => {
    const newCart = [...cart];
    newCart.splice(index, 1);
    setCart(newCart);
  };

  const handleSubmit = async () => {
    if (cart.length === 0) return;
    if (!selectedCustomerId) {
      alert("Chọn khách hàng");
      return;
    }

    setIsSubmitting(true);
    try {
      const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
      if (selectedCustomer) db.saveQuickCustomer(selectedCustomer.name, selectedCustomer.phone);

      await db.createSale(
        selectedCustomerId,
        new Date().toISOString().split('T')[0],
        cart.map(c => ({...c, paymentMethod})), // Pass payment method if needed per line, but db uses invoice level mostly
        paidAmount,
        paymentMethod
      );
      alert("Bán hàng thành công!");
      setCart([]);
      setPaidAmount(0);
      setPaymentMethod(PaymentMethod.CASH);
      navigate('dashboard');
    } catch (e) {
      console.error(e);
      alert("Lỗi khi tạo đơn");
    } finally {
      setIsSubmitting(false);
    }
  };

  // VietQR Link Generator
  const getQrLink = () => {
    if (!bankSettings) return null;
    if (!bankSettings.bankId || !bankSettings.accountNo) return null;
    const customer = customers.find(c => c.id === selectedCustomerId);
    const customerName = customer ? customer.name : 'Khach hang';
    
    // Remove vietnamese accents for QR compatibility
    const normalize = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
    
    const { bankId, accountNo } = bankSettings;
    const template = bankSettings.template || 'compact';
    // Format info: "TenKhachHang"
    const info = normalize(customerName).substring(0, 50); 

    const transferAmount = Math.max(0, Number(paidAmount) || Number(totalAmount) || 0);
    const amountParam = transferAmount > 0 ? `amount=${transferAmount}&` : '';
    return `https://img.vietqr.io/image/${bankId}-${accountNo}-${template}.png?${amountParam}addInfo=${encodeURIComponent(info)}`;
  };

  const handleOpenQrFullscreen = () => {
    if (!qrLink) return;
    setIsQrPreviewOpen(true);
  };

  const handleDownloadQr = async () => {
    const qr = getQrLink();
    if (!qr) return;
    try {
      const response = await fetch(qr);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vietqr-ban-hang-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (_e) {
      window.open(qr, '_blank', 'noopener,noreferrer');
    }
  };

  const qrLink = getQrLink();

  // Stock Helper
  const getStock = (pid: string) => {
    const prodBatches = batches.filter(b => b.productId === pid && b.status === 'OPEN');
    const kg = prodBatches.reduce((a, b) => a + b.qtyRemKg, 0);
    const con = prodBatches.reduce((a, b) => a + b.qtyRemCon, 0);
    return { kg, con };
  }

  return (
    <div className="pb-20 h-full flex flex-col">
      <div className="flex-none mb-4">
        <label className="text-sm font-bold text-gray-700 mb-1 block">Khách hàng</label>
        <div className="flex gap-2">
            <div className="flex-1">
                <select 
                   value={selectedCustomerId} 
                   onChange={(e) => setSelectedCustomerId(e.target.value)}
                   className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                   {customers.map(s => <option key={s.id} value={s.id} className="bg-slate-700 text-white">{s.name}</option>)}
                </select>
            </div>
            <button 
                onClick={() => setIsAddCustModalOpen(true)}
                className="px-3 py-2 bg-brand-600 text-white rounded-lg font-bold shadow-sm"
            >
                +
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar space-y-4">
        {/* Product Grid */}
        <div>
            <div className="flex justify-between items-end mb-2">
                <label className="text-sm font-medium text-gray-700 block">Chọn Gà</label>
                <button onClick={openManualEntry} className="text-xs font-bold text-brand-600 border border-brand-200 px-2 py-1 rounded bg-brand-50">
                    + Nhập hàng ngoài
                </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
                {products.map(p => {
                    const stock = getStock(p.id);
                    const isOutOfStock = stock.kg <= 0.1 && stock.con <= 0;
                    return (
                        <button 
                            key={p.id}
                            onClick={() => !isOutOfStock && openProductModal(p)}
                            disabled={isOutOfStock}
                            className={`flex flex-col items-center justify-center p-3 border rounded-xl shadow-sm transition-all h-28 relative ${isOutOfStock ? 'bg-gray-100 border-gray-200 opacity-60 cursor-not-allowed' : 'bg-white border-brand-100 active:bg-brand-50 active:border-brand-300'}`}
                        >
                            <span className="font-bold text-gray-800 text-sm text-center leading-tight mb-1">{p.name}</span>
                            <span className="text-xs text-brand-600 font-bold">{formatCurrency(p.priceMale)}</span>
                            
                            <div className="mt-2 text-[10px] text-gray-500 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100">
                                {isOutOfStock ? (
                                    <span className="text-red-500 font-bold">HẾT GÀ</span>
                                ) : (
                                    <span>Còn: {stock.kg.toFixed(1)}kg / {stock.con}c</span>
                                )}
                            </div>
                        </button>
                    )
                })}
            </div>
        </div>

        {/* Cart Preview */}
        {cart.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mt-4">
                <div className="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Giỏ hàng ({cart.length})
                </div>
                <div className="divide-y divide-gray-100">
                    {cart.map((item, idx) => (
                    <div key={idx} className="p-3 flex justify-between items-center">
                        <div>
                        <div className="font-medium text-gray-800 text-sm">{item.productName}</div>
                        <div className="text-xs text-gray-500">
                            {item.qtyKg > 0 ? `${item.qtyKg} kg` : ''} 
                            {item.qtyKg > 0 && item.qtyCon > 0 ? ' / ' : ''}
                            {item.qtyCon > 0 ? `${item.qtyCon} con` : ''}
                            {' x '}{formatCurrency(item.price)}
                        </div>
                        </div>
                        <div className="flex items-center gap-3">
                        <span className="font-bold text-gray-700 text-sm">{formatCurrency(item.amount)}</span>
                        <button onClick={() => removeFromCart(idx)} className="text-red-400 p-1">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                        </div>
                    </div>
                    ))}
                </div>
            </div>
        )}
      </div>

      {/* Footer Payment */}
      <div className="flex-none bg-white border-t border-gray-100 pt-4 mt-2">
         {/* Payment Methods */}
         <div className="flex gap-2 mb-3">
            <button 
              onClick={() => setPaymentMethod(PaymentMethod.CASH)}
              className={`flex-1 py-2 text-xs font-bold rounded border ${paymentMethod === PaymentMethod.CASH ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-300'}`}
            >
              TIỀN MẶT
            </button>
            <button 
              onClick={() => setPaymentMethod(PaymentMethod.TRANSFER)}
              className={`flex-1 py-2 text-xs font-bold rounded border ${paymentMethod === PaymentMethod.TRANSFER ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'}`}
            >
              CHUYỂN KHOẢN
            </button>
            <button 
              onClick={() => setPaymentMethod(PaymentMethod.DEBT)}
              className={`flex-1 py-2 text-xs font-bold rounded border ${paymentMethod === PaymentMethod.DEBT ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-600 border-gray-300'}`}
            >
              GHI NỢ
            </button>
         </div>

         {/* QR Code Section */}
         {paymentMethod === PaymentMethod.TRANSFER && totalAmount > 0 && (
            <div className="mb-4 bg-blue-50 p-3 rounded-lg border border-blue-100 text-center">
               {bankSettings && qrLink ? (
                 <>
                    <div className="text-xs text-blue-800 font-semibold mb-2">Quét mã để thanh toán</div>
                    <img src={qrLink} alt="VietQR" className="mx-auto h-40 object-contain bg-white p-1 rounded" />
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
                  onClick={handleDownloadQr}
                  disabled={!qrLink}
                  className="w-full py-2 text-xs font-bold rounded border border-blue-600 bg-blue-600 text-white disabled:bg-gray-200 disabled:text-gray-500 disabled:border-gray-300"
                >
                  Tải QR
                </button>
                <button
                  type="button"
                  onClick={handleOpenQrFullscreen}
                  disabled={!qrLink}
                  className="w-full py-2 text-xs font-bold rounded border border-blue-600 bg-white text-blue-700 disabled:bg-gray-200 disabled:text-gray-500 disabled:border-gray-300"
                >
                  Mở QR toàn màn hình
                </button>
               </div>
            </div>
         )}

         <div className="flex justify-between items-end mb-4">
            <div>
                <span className="text-gray-500 text-sm">Tổng đơn</span>
                <div className="text-2xl font-bold text-brand-600 leading-none">{formatCurrency(totalAmount)}</div>
            </div>
            <div className="w-1/2">
                 <Input 
                    label="Khách trả"
                    type="number" 
                    value={paidAmount} 
                    onChange={(e: any) => setPaidAmount(Number(e.target.value))} 
                    className="text-right font-bold"
                    disabled={paymentMethod === PaymentMethod.DEBT}
                 />
            </div>
         </div>
         <Button 
            className="w-full py-3.5 text-lg shadow-lg shadow-brand-100" 
            onClick={handleSubmit} 
            disabled={cart.length === 0 || isSubmitting}
         >
            {paymentMethod === PaymentMethod.DEBT ? 'LƯU NỢ' : 'THANH TOÁN'}
         </Button>
      </div>

      {/* Add Item Modal */}
      <Modal 
        isOpen={!!activeProduct} 
        onClose={() => setActiveProduct(null)} 
        title={isManualItem ? "Nhập Hàng Ngoài" : activeProduct?.name}
      >
         <div className="space-y-4">
            {isManualItem && (
              
                 <Input 
                    label="Tên mặt hàng" 
                    value={manualName} 
                    onChange={(e: any) => setManualName(e.target.value)} 
                    placeholder="VD: Gà đi bộ..."
                    autoFocus
                />
            )}

            {/* TOGGLE CHỌN GIỚI TÍNH KHI BÁN */}
            {!isManualItem && (
                <div className="flex gap-2 mb-2 p-1 bg-gray-100 rounded-lg">
                    <button 
                        onClick={() => {
                            setSaleGender('MALE');
                            // Tự động nhảy giá theo Trống
                        if(!useManualPrice && activeProduct) setPrice(((activeProduct.priceMale || 0) / 1000).toString());
                        }}
                        className={`flex-1 py-2 text-xs font-bold rounded transition-all ${saleGender === 'MALE' ? 'bg-white text-blue-600 shadow' : 'text-gray-400'}`}
                    >
                        GÀ TRỐNG
                    </button>
                    <button 
                        onClick={() => {
                            setSaleGender('FEMALE');
                            // Tự động nhảy giá theo Mái
                        if(!useManualPrice && activeProduct) setPrice(((activeProduct.priceFemale || 0) / 1000).toString());
                        }}
                        className={`flex-1 py-2 text-xs font-bold rounded transition-all ${saleGender === 'FEMALE' ? 'bg-white text-pink-500 shadow' : 'text-gray-400'}`}
                    >
                        GÀ MÁI
                    </button>
                </div>
            )}

            <div className="flex gap-3">
                <div className="flex-1">
                    <Input 
                        label="Số Kg" 
                        type="number" 
                        placeholder="0.0"
                        value={qtyKg} 
                        onChange={(e: any) => setQtyKg(e.target.value)} 
                        autoFocus={!isManualItem}
                    />
                </div>
                <div className="flex-1">
                    <Input 
                        label="Số Con" 
                        type="number" 
                        placeholder="0"
                        value={qtyCon} 
                        onChange={(e: any) => setQtyCon(e.target.value)} 
                    />
                </div>
            </div>
            
            <div className="pt-2">
                <div className="flex justify-between mb-1">
                  <label className="text-sm font-medium text-gray-700">Đơn giá (nghìn VND/kg hoặc con)</label>
                    {!isManualItem && (
                        <button 
                            onClick={() => setUseManualPrice(!useManualPrice)} 
                            className="text-xs text-brand-600 underline"
                        >
                            {useManualPrice ? 'Dùng giá mặc định' : 'Sửa giá'}
                        </button>
                    )}
                </div>
                {isManualItem || useManualPrice ? (
                     <Input 
                        value={price} 
                        onChange={(e: any) => setPrice(e.target.value)} 
                        type="number"
                      placeholder="VD: 95"
                     />
                ) : (
                    <div className="w-full px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-gray-600">
                      {formatCurrency((Number(price) || 0) * 1000)}
                    </div>
                )}
            </div>

            <Button className="w-full mt-2" onClick={addToCart}>Thêm vào giỏ</Button>
         </div>
      </Modal>

      {isQrPreviewOpen && qrLink && (
        <div className="fixed inset-0 z-[70] bg-black/85 flex flex-col">
          <div className="flex items-center justify-between p-4 text-white">
            <div className="font-bold">QR chuyển khoản</div>
            <button
              onClick={() => setIsQrPreviewOpen(false)}
              className="px-3 py-1 rounded border border-white/40 text-sm"
            >
              Đóng
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center p-4">
            <img src={qrLink} alt="VietQR fullscreen" className="max-h-full max-w-full object-contain bg-white rounded-lg p-2" />
          </div>
        </div>
      )}

      {/* Add Customer Modal */}
      <Modal isOpen={isAddCustModalOpen} onClose={() => setIsAddCustModalOpen(false)} title="Thêm Khách Mới">
         <div className="space-y-4">
            <Input label="Tên khách" value={newCustName} onChange={(e: any) => setNewCustName(e.target.value)} autoFocus />
            <Input label="Số điện thoại" value={newCustPhone} onChange={(e: any) => setNewCustPhone(e.target.value)} type="tel" />
            <Button className="w-full" onClick={handleAddCustomer}>Lưu Khách Hàng</Button>
         </div>
      </Modal>
    </div>
  );
}