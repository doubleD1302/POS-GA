import React, { useState, useEffect, useRef } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import Dashboard from './pages/Dashboard';
import POS from './pages/POS';
import Inventory from './pages/Inventory';
import { ICONS, formatCurrency } from './constants';
import { db } from './services/db';
import { Button, Input, Select, Card, Modal } from './components/ui';
import { Partner, PartnerType, BankSettings, Invoice, CashTransaction, PreOrder, PaymentMethod, Product } from './types';

// --- LOGIN COMPONENT ---
function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [code, setCode] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);

  const handleLogin = () => {
    if (code.length !== 6 || isNaN(Number(code))) {
      alert("Vui lòng nhập mã doanh nghiệp gồm 6 chữ số");
      return;
    }

    const exists = db.checkBusinessExists(code);
    if (!exists) {
      setIsConfirming(true);
    } else {
      db.setBusinessId(code);
      db.initStartDate(); // Initialize start date on login
      onLogin();
    }
  };

  const confirmCreate = () => {
    db.setBusinessId(code);
    db.initStartDate(); // Initialize start date on creation
    onLogin();
  };

  if (isConfirming) {
    return (
      <div className="min-h-screen bg-brand-600 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
          <h2 className="text-xl font-bold text-gray-800 mb-2">Doanh nghiệp mới?</h2>
          <p className="text-gray-600 mb-6 text-sm">
            Mã <b>{code}</b> chưa tồn tại trên thiết bị này. Bạn có muốn tạo dữ liệu mới cho doanh nghiệp này không?
          </p>
          <div className="flex gap-3">
             <Button variant="secondary" className="flex-1" onClick={() => setIsConfirming(false)}>Quay lại</Button>
             <Button className="flex-1" onClick={confirmCreate}>Tạo mới</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-600 flex flex-col items-center justify-center p-6">
      <div className="text-white mb-8 text-center">
        <h1 className="text-3xl font-bold mb-2">Gà Thịt Thảo Dương</h1>
        <p className="text-brand-100 opacity-90">Chuyên cung cấp sỉ & lẻ các loại gà</p>
      </div>
      
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <label className="block text-sm font-bold text-gray-700 mb-2">Nhập mã doanh nghiệp</label>
        <Input 
          placeholder="Ví dụ: 123456" 
          value={code} 
          onChange={(e: any) => setCode(e.target.value)} 
          className="mb-4 text-center text-xl tracking-widest"
          type="tel"
          autoFocus
        />
        <Button className="w-full py-3 text-lg" onClick={handleLogin}>
          Truy cập
        </Button>
        <p className="text-xs text-center text-gray-400 mt-4">
          Mỗi mã 6 số tương ứng với một tài khoản riêng biệt.
        </p>
      </div>
    </div>
  );
}

// --- IMPORT PAGE ---
function ImportPage({ navigate }: { navigate: (p: string) => void }) {
  const [suppliers, setSuppliers] = useState<Partner[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [supplierId, setSupplierId] = useState('');
  
  // Ticket Data (List of finalized items)
  const [ticketItems, setTicketItems] = useState<{pid: string, pName: string, kg: number, con: number, price: number, total: number}[]>([]);

  // --- WEIGHING CALCULATOR STATE ---
  const [currentPid, setCurrentPid] = useState('');
  
  // Changed: Store object {w: weight, c: count}
  const [weightList, setWeightList] = useState<{w: number, c: number}[]>([]);
  
  const [currentWeightInput, setCurrentWeightInput] = useState('');
  const [currentCountInput, setCurrentCountInput] = useState(''); // New input for count per entry
  
  const [tareWeight, setTareWeight] = useState(''); // Tổng bì
  const [currentPrice, setCurrentPrice] = useState('');
  
  // Modals
  const [isSupModalOpen, setIsSupModalOpen] = useState(false);
  const [newSupName, setNewSupName] = useState('');
  const [newSupPhone, setNewSupPhone] = useState('');
  
  const [isProdModalOpen, setIsProdModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [prodName, setProdName] = useState('');
  const [prodPrice, setProdPrice] = useState('');

  const weightInputRef = useRef<HTMLInputElement>(null);
  const countInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSuppliers();
    loadProducts();
  }, []);

  const loadSuppliers = () => {
    const list = db.getPartners(PartnerType.SUPPLIER);
    setSuppliers(list);
    if (!supplierId && list.length > 0) setSupplierId(list[0].id);
  }

  const loadProducts = () => {
    setProducts(db.getProducts());
  }

  // --- CALCULATOR LOGIC ---
  const handleAddWeight = () => {
    const w = parseFloat(currentWeightInput);
    const c = parseInt(currentCountInput); // Parse count

    if (isNaN(w) || w <= 0) {
      alert("Vui lòng nhập số cân");
      weightInputRef.current?.focus();
      return;
    }
    // Allow c to be 0 or empty if user doesn't want to track count strictly, but usually required
    const countVal = isNaN(c) ? 0 : c;

    setWeightList([...weightList, { w, c: countVal }]);
    setCurrentWeightInput('');
    setCurrentCountInput('');
    weightInputRef.current?.focus();
  };

  const handleRemoveWeight = (index: number) => {
    const n = [...weightList];
    n.splice(index, 1);
    setWeightList(n);
  };

  const totalGrossWeight = weightList.reduce((a, b) => a + b.w, 0);
  const totalCon = weightList.reduce((a, b) => a + b.c, 0); // Calculated Total Con
  
  const totalTare = parseFloat(tareWeight) || 0;
  const netWeight = Math.max(0, totalGrossWeight - totalTare);
  const estimatedCost = netWeight * (parseFloat(currentPrice) || 0);

  const handleAddItemToTicket = () => {
    if (!currentPid) return alert("Chọn loại gà");
    if (netWeight <= 0) return alert("Khối lượng thực phải lớn hơn 0");
    if (!currentPrice) return alert("Chưa nhập giá");

    const prod = products.find(p => p.id === currentPid);
    
    setTicketItems([...ticketItems, {
      pid: currentPid,
      pName: prod ? prod.name : 'Unknown',
      kg: netWeight,
      con: totalCon,
      price: parseFloat(currentPrice),
      total: estimatedCost
    }]);

    // Reset Calculator
    setWeightList([]);
    setTareWeight('');
    // Keep price and pid for convenience
    // setCurrentPid(''); 
    setCurrentWeightInput('');
    setCurrentCountInput('');
  };

  const handleRemoveTicketItem = (idx: number) => {
    const n = [...ticketItems];
    n.splice(idx, 1);
    setTicketItems(n);
  }

  const handleImport = async () => {
    if(!supplierId) return alert('Chọn nhà cung cấp');
    if(ticketItems.length === 0) return alert('Chưa có hàng hoá nào');

    await db.createPurchase(supplierId, new Date().toISOString().split('T')[0], 
      ticketItems.map(i => ({ productId: i.pid, qtyKg: i.kg, qtyCon: i.con, price: i.price })),
      0, 0
    );
    alert('Nhập hàng thành công');
    navigate('inventory');
  }

  // --- SUPPLIER & PRODUCT MODALS ---
  const handleAddSupplier = () => {
    if (!newSupName) return;
    const newSup: Partner = {
       id: `s-${Date.now()}`,
       name: newSupName,
       phone: newSupPhone,
       type: PartnerType.SUPPLIER,
       debt: 0
    };
    db.savePartner(newSup);
    loadSuppliers();
    setSupplierId(newSup.id);
    setIsSupModalOpen(false);
    setNewSupName('');
    setNewSupPhone('');
  };

  const handleDeleteSupplier = () => {
     if (!supplierId) return;
     if (window.confirm("Xoá nhà cung cấp này?")) {
        db.deletePartner(supplierId);
        setTimeout(() => {
            const list = db.getPartners(PartnerType.SUPPLIER);
            setSuppliers(list);
            setSupplierId(list.length > 0 ? list[0].id : '');
        }, 50);
     }
  }

  const handleOpenProdModal = (pid?: string) => {
    if (pid) {
      const p = products.find(x => x.id === pid);
      if (p) {
        setEditingProduct(p);
        setProdName(p.name);
        setProdPrice(p.defaultPrice.toString());
      }
    } else {
      setEditingProduct(null);
      setProdName('');
      setProdPrice('');
    }
    setIsProdModalOpen(true);
  }

  const handleSaveProduct = () => {
     if (!prodName) return;
     const newProd: Product = {
        id: editingProduct ? editingProduct.id : `p-${Date.now()}`,
        name: prodName,
        defaultPrice: Number(prodPrice) || 0,
        standardCost: editingProduct?.standardCost 
     };
     db.saveProduct(newProd);
     loadProducts();
     // If we were adding a new product, auto select it
     if (!editingProduct) setCurrentPid(newProd.id);
     setIsProdModalOpen(false);
  }

  // Select product handler to auto-fill import price if available
  const handleSelectProduct = (pid: string) => {
    setCurrentPid(pid);
    const p = products.find(x => x.id === pid);
    if (p && p.standardCost) {
      setCurrentPrice(p.standardCost.toString());
    } else {
      setCurrentPrice('');
    }
  }

  return (
    <div className="pb-24">
      <h1 className="text-xl font-bold mb-4 flex items-center gap-2 text-brand-900">
        <ICONS.Inventory /> Nhập Hàng
      </h1>

      {/* 1. SUPPLIER SELECT */}
      <Card className="mb-4 bg-blue-50 border-blue-100">
         <div className="flex justify-between items-center mb-1">
            <label className="text-xs font-bold text-blue-800 uppercase">Nhà Cung Cấp</label>
            {supplierId && (
                <button onClick={handleDeleteSupplier} className="text-red-400 text-xs">Xoá</button>
            )}
         </div>
         <div className="flex gap-2">
           <div className="flex-1">
              <select 
                 value={supplierId} 
                 onChange={(e) => setSupplierId(e.target.value)}
                 className="w-full px-3 py-3 bg-white border border-blue-200 rounded-lg text-gray-800 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
              >
                 {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
           </div>
           <button onClick={() => setIsSupModalOpen(true)} className="px-4 bg-blue-600 text-white rounded-lg font-bold shadow-sm">+</button>
         </div>
      </Card>

      {/* 2. WEIGHING CALCULATOR */}
      <Card className="mb-6 border-brand-200 shadow-md">
        <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-brand-800 flex items-center gap-2">
                <span>⚖️ Bàn Cân</span>
            </h3>
            <div className="text-xs text-gray-500 italic">Nhập từng mã cân + số con</div>
        </div>

        {/* Product Select */}
        <div className="flex gap-2 mb-3">
             <div className="flex-1">
                <select 
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500" 
                  value={currentPid} 
                  onChange={e => handleSelectProduct(e.target.value)}
                >
                  <option value="">-- Chọn Loại Gà --</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
             </div>
             {currentPid ? (
                <button onClick={() => handleOpenProdModal(currentPid)} className="px-3 bg-gray-100 text-gray-600 border border-gray-300 rounded-lg">✎</button>
             ) : (
                <button onClick={() => handleOpenProdModal()} className="px-3 bg-brand-600 text-white rounded-lg font-bold">+</button>
             )}
        </div>

        {/* Weighing Input - SPLIT INTO WEIGHT AND COUNT */}
        <div className="flex gap-2 mb-3 items-end">
            <div className="flex-1">
                 <label className="text-[10px] text-gray-500 font-bold ml-1">SỐ KG</label>
                 <input 
                    ref={weightInputRef}
                    type="number" 
                    placeholder="0.0" 
                    className="w-full px-3 py-2 text-lg font-bold text-gray-800 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
                    value={currentWeightInput}
                    onChange={e => setCurrentWeightInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') countInputRef.current?.focus();
                    }}
                />
            </div>
            <div className="w-24">
                 <label className="text-[10px] text-gray-500 font-bold ml-1">SỐ CON</label>
                 <input 
                    ref={countInputRef}
                    type="number" 
                    placeholder="0" 
                    className="w-full px-3 py-2 text-lg font-bold text-center text-gray-800 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
                    value={currentCountInput}
                    onChange={e => setCurrentCountInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddWeight()}
                />
            </div>
            <Button onClick={handleAddWeight} className="h-[46px] w-14 flex items-center justify-center">↵</Button>
        </div>

        {/* Weight List (Chips) */}
        {weightList.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4 p-2 bg-gray-50 rounded-lg border border-gray-100 max-h-32 overflow-y-auto">
                {weightList.map((item, i) => (
                    <span key={i} className="inline-flex items-center px-2 py-1 rounded-md text-sm font-medium bg-white border border-gray-200 shadow-sm text-gray-700">
                        {item.w}kg <span className="text-gray-400 text-xs mx-1">({item.c}c)</span>
                        <button onClick={() => handleRemoveWeight(i)} className="ml-1 text-red-400 hover:text-red-600">×</button>
                    </span>
                ))}
            </div>
        )}

        {/* Calculation Grid */}
        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-3">
            <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500">Tổng cân (Gross):</span>
                <span className="font-bold text-gray-800">{totalGrossWeight.toFixed(2)} kg</span>
            </div>
            <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Trừ Bì (Lồng):</span>
                <div className="w-24">
                    <input 
                        type="number" 
                        className="w-full px-2 py-1 text-right text-sm font-bold text-red-600 bg-white border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-red-500"
                        placeholder="0"
                        value={tareWeight}
                        onChange={e => setTareWeight(e.target.value)}
                    />
                </div>
            </div>
            <div className="border-t border-gray-300 pt-2 flex justify-between items-center">
                <span className="font-bold text-brand-700">Thực Nhập (Net):</span>
                <span className="text-xl font-bold text-brand-600">{netWeight.toFixed(2)} kg</span>
            </div>
        </div>

        {/* Price & Count */}
        <div className="grid grid-cols-2 gap-3 mt-4">
             <Input 
                label="Giá nhập / kg" 
                type="number" 
                value={currentPrice} 
                onChange={(e: any) => setCurrentPrice(e.target.value)} 
                className="font-bold"
                placeholder="0"
             />
             <div className="flex flex-col">
                <label className="text-sm font-bold text-gray-700 mb-1">Tổng số con</label>
                <div className="w-full px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-gray-800 font-bold">
                    {totalCon}
                </div>
             </div>
        </div>

        <div className="mt-4 pt-2 border-t border-dashed border-gray-200">
             <div className="flex justify-between items-center mb-2">
                 <span className="text-sm font-semibold text-gray-600">Thành tiền lô này:</span>
                 <span className="text-lg font-bold text-blue-600">{formatCurrency(estimatedCost)}</span>
             </div>
             <Button onClick={handleAddItemToTicket} className="w-full" disabled={netWeight <= 0}>
                ⬇ Thêm Vào Phiếu
             </Button>
        </div>
      </Card>

      {/* 3. TICKET PREVIEW */}
      {ticketItems.length > 0 && (
          <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden mb-20">
             <div className="bg-gray-100 px-4 py-2 border-b border-gray-200 flex justify-between items-center">
                 <h4 className="font-bold text-gray-700">Phiếu Nhập Hàng</h4>
                 <span className="text-xs font-mono text-gray-500">{ticketItems.length} mặt hàng</span>
             </div>
             <div className="divide-y divide-gray-100">
                {ticketItems.map((item, idx) => (
                    <div key={idx} className="p-3">
                        <div className="flex justify-between items-start mb-1">
                            <span className="font-bold text-gray-800">{item.pName}</span>
                            <span className="font-bold text-gray-900">{formatCurrency(item.total)}</span>
                        </div>
                        <div className="flex justify-between text-xs text-gray-500">
                             <span>{item.kg.toFixed(2)} kg x {formatCurrency(item.price)}</span>
                             <span>{item.con} con</span>
                             <button onClick={() => handleRemoveTicketItem(idx)} className="text-red-500 font-medium">Xoá</button>
                        </div>
                    </div>
                ))}
             </div>
             <div className="p-4 bg-gray-50 border-t border-gray-200">
                 <div className="flex justify-between items-center mb-3">
                     <span className="font-bold text-gray-700">Tổng Thanh Toán:</span>
                     <span className="text-xl font-bold text-brand-600">
                        {formatCurrency(ticketItems.reduce((a, b) => a + b.total, 0))}
                     </span>
                 </div>
                 <Button onClick={handleImport} className="w-full py-3 text-lg shadow-lg">LƯU PHIẾU NHẬP</Button>
             </div>
          </div>
      )}

      {/* Modals */}
      <Modal isOpen={isSupModalOpen} onClose={() => setIsSupModalOpen(false)} title="Thêm Nhà Cung Cấp">
         <div className="space-y-4">
            <Input label="Tên trại/người bán" value={newSupName} onChange={(e:any) => setNewSupName(e.target.value)} />
            <Input label="Số điện thoại" value={newSupPhone} onChange={(e:any) => setNewSupPhone(e.target.value)} />
            <Button className="w-full" onClick={handleAddSupplier}>Lưu</Button>
         </div>
      </Modal>

      <Modal isOpen={isProdModalOpen} onClose={() => setIsProdModalOpen(false)} title={editingProduct ? "Sửa Loại Gà" : "Thêm Loại Gà"}>
         <div className="space-y-4">
            <Input label="Tên loại gà" value={prodName} onChange={(e:any) => setProdName(e.target.value)} placeholder="VD: Gà Ri..." />
            <Input label="Giá bán mặc định" value={prodPrice} onChange={(e:any) => setProdPrice(e.target.value)} type="number" />
            <Button className="w-full" onClick={handleSaveProduct}>Lưu Thông Tin</Button>
         </div>
      </Modal>
    </div>
  )
}

// --- CASHBOOK PAGE ---
function CashbookPage() {
  const [txns, setTxns] = useState(db.getCashTransactions());
  const [chartData, setChartData] = useState<any[]>([]);
  const [preOrders, setPreOrders] = useState<PreOrder[]>([]);
  
  // Stats
  const [totalReceivables, setTotalReceivables] = useState(0);
  
  // Detail Modal
  const [selectedTxn, setSelectedTxn] = useState<CashTransaction | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | undefined>(undefined);

  // Settings Modal
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingStep, setSettingStep] = useState<'INPUT' | 'CONFIRM'>('INPUT');
  const [bankId, setBankId] = useState('');
  const [accNo, setAccNo] = useState('');
  const [accName, setAccName] = useState(''); // Used for input
  const [lookupName, setLookupName] = useState(''); // Used for confirmation

  // PreOrder Modal
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<PreOrder | null>(null);
  const [poName, setPoName] = useState('');
  const [poPhone, setPoPhone] = useState('');
  const [poProduct, setPoProduct] = useState('');
  const [poCon, setPoCon] = useState('');
  const [poKg, setPoKg] = useState('');
  const [poTime, setPoTime] = useState('');
  const [poNote, setPoNote] = useState('');

  useEffect(() => {
    // START DATE LOGIC: Show 30 days STARTING from the first login date
    const startDateStr = db.getStartDate();
    const startDate = new Date(startDateStr);
    const data = [];

    // Loop from startDate to startDate + 30 days
    for (let i = 0; i < 30; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];

        const dayTxns = txns.filter(t => t.date.startsWith(dateStr));
        const income = dayTxns.filter(t => t.type === 'INCOME').reduce((s, t) => s + t.amount, 0);
        const expense = dayTxns.filter(t => t.type === 'EXPENSE').reduce((s, t) => s + t.amount, 0);

        data.push({
            date: dateStr.split('-').slice(1).join('/'), // MM/DD
            Thu: income,
            Chi: expense
        });
    }

    setChartData(data);

    // Get Total Receivables
    const customers = db.getPartners(PartnerType.CUSTOMER);
    const debt = customers.reduce((sum, c) => sum + c.debt, 0);
    setTotalReceivables(debt);

    // Load Bank Settings
    const bs = db.getBankSettings();
    if (bs) {
       setBankId(bs.bankId);
       setAccNo(bs.accountNo);
       setAccName(bs.accountName); // Pre-fill
    }
    
    // Load PreOrders
    setPreOrders(db.getPreOrders().filter(o => o.status === 'PENDING'));
  }, [txns]);

  const handleOpenSettings = () => {
    setSettingStep('INPUT');
    const bs = db.getBankSettings();
    if (bs) {
      setBankId(bs.bankId);
      setAccNo(bs.accountNo);
      setAccName(bs.accountName);
    }
    setIsSettingsOpen(true);
  }

  const handleCheckAccount = async () => {
    if (!bankId || !accNo || !accName) return alert("Vui lòng nhập đủ thông tin");
    // Simulate lookup: Just trust what the user entered
    setTimeout(() => {
      setLookupName(accName.toUpperCase()); 
      setSettingStep('CONFIRM');
    }, 500);
  }

  const handleSaveSettings = () => {
     const settings: BankSettings = {
       bankId: bankId.toUpperCase(),
       accountNo: accNo,
       accountName: lookupName.toUpperCase(), // Use confirmed name
       template: 'compact'
     };
     db.saveBankSettings(settings);
     setIsSettingsOpen(false);
  }

  const handleSelectTxn = (txn: CashTransaction) => {
    setSelectedTxn(txn);
    if (txn.refId) {
       const inv = db.getInvoice(txn.refId);
       setSelectedInvoice(inv);
    } else {
       setSelectedInvoice(undefined);
    }
  }

  // PreOrder Logic
  const handleOpenOrderModal = (order?: PreOrder) => {
    if (order) {
      setSelectedOrder(order);
      setPoName(order.customerName);
      setPoPhone(order.phone || '');
      setPoProduct(order.productNote);
      setPoCon(order.qtyCon?.toString() || '');
      setPoKg(order.qtyKg?.toString() || '');
      setPoTime(order.deliveryTime);
      setPoNote(order.note || '');
    } else {
      setSelectedOrder(null);
      setPoName('');
      setPoPhone('');
      setPoProduct('');
      setPoCon('');
      setPoKg('');
      // Default time: now + 1 hour
      const now = new Date();
      now.setHours(now.getHours() + 1);
      now.setMinutes(0);
      setPoTime(now.toISOString().slice(0, 16));
      setPoNote('');
    }
    setIsOrderModalOpen(true);
  }

  const handleSaveOrder = () => {
    if (!poName || !poTime) return alert("Cần nhập tên khách và giờ hẹn");
    const order: PreOrder = {
      id: selectedOrder ? selectedOrder.id : `po-${Date.now()}`,
      customerName: poName,
      phone: poPhone,
      productNote: poProduct,
      qtyCon: Number(poCon) || 0,
      qtyKg: Number(poKg) || 0,
      deliveryTime: poTime,
      note: poNote,
      status: 'PENDING'
    };
    db.savePreOrder(order);
    setPreOrders(db.getPreOrders().filter(o => o.status === 'PENDING'));
    setIsOrderModalOpen(false);
  }

  const handleDeleteOrder = () => {
    if (!selectedOrder) return;
    if (confirm("Xoá đơn đặt hàng này?")) {
      db.deletePreOrder(selectedOrder.id);
      setPreOrders(db.getPreOrders().filter(o => o.status === 'PENDING'));
      setIsOrderModalOpen(false);
    }
  }

  const handleCompleteOrder = () => {
    if (!selectedOrder) return;
    const completed = { ...selectedOrder, status: 'DONE' as const };
    db.savePreOrder(completed);
    setPreOrders(db.getPreOrders().filter(o => o.status === 'PENDING'));
    setIsOrderModalOpen(false);
  }

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    } catch(e) { return ''; }
  }

  const formatDateShort = (isoString: string) => {
    try {
        const d = new Date(isoString);
        return `${d.getDate()}/${d.getMonth()+1}`;
    } catch (e) { return ''; }
  }

  const getPaymentMethodLabel = (method?: PaymentMethod) => {
      switch(method) {
          case PaymentMethod.CASH: return 'Tiền mặt';
          case PaymentMethod.TRANSFER: return 'Chuyển khoản';
          case PaymentMethod.DEBT: return 'Ghi nợ';
          default: return 'Khác';
      }
  }

  // Calculate Period Stats
  const periodIncome = chartData.reduce((sum, d) => sum + d.Thu, 0);
  const periodExpense = chartData.reduce((sum, d) => sum + d.Chi, 0);

  return (
    <div className="pb-20">
      <div className="flex justify-between items-center mb-4">
         <h1 className="text-xl font-bold">Sổ Quỹ</h1>
         <button onClick={handleOpenSettings} className="text-sm text-brand-600 font-medium bg-brand-50 px-3 py-1 rounded-full border border-brand-100">
            ⚙ Cấu hình QR
         </button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100">
              <div className="text-xs text-gray-500 uppercase">Tổng Thu (Kỳ)</div>
              <div className="text-lg font-bold text-green-600">{formatCurrency(periodIncome)}</div>
          </div>
          <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100">
              <div className="text-xs text-gray-500 uppercase">Tổng Chi (Kỳ)</div>
              <div className="text-lg font-bold text-red-600">{formatCurrency(periodExpense)}</div>
          </div>
          <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100">
              <div className="text-xs text-gray-500 uppercase">Chênh Lệch</div>
              <div className={`text-lg font-bold ${periodIncome - periodExpense >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                {formatCurrency(periodIncome - periodExpense)}
              </div>
          </div>
           <div className="bg-orange-50 p-3 rounded-lg shadow-sm border border-orange-100">
              <div className="text-xs text-orange-800 uppercase font-bold">KHÁCH NỢ (TỔNG)</div>
              <div className="text-lg font-bold text-orange-600">{formatCurrency(totalReceivables)}</div>
          </div>
      </div>

      <Card title="Biến động (30 ngày gần nhất)" className="mb-4 h-64">
         <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
               <CartesianGrid strokeDasharray="3 3" vertical={false} />
               <XAxis dataKey="date" fontSize={10} tickMargin={5} minTickGap={15} />
               <YAxis hide />
               <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{fontSize: '12px'}} />
               <Bar dataKey="Thu" fill="#22c55e" radius={[2, 2, 0, 0]} stackId="a" />
               <Bar dataKey="Chi" fill="#ef4444" radius={[2, 2, 0, 0]} stackId="a" />
            </BarChart>
         </ResponsiveContainer>
      </Card>

      {/* PRE-ORDERS / TODO SECTION */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
           <h3 className="font-bold text-gray-700">Đơn đặt hàng</h3>
           <button onClick={() => handleOpenOrderModal()} className="text-sm bg-brand-600 text-white px-3 py-1 rounded-lg shadow font-medium">+ Thêm</button>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-2 space-y-2 min-h-[60px]">
           {preOrders.length === 0 ? (
             <div className="text-center text-gray-400 text-sm italic py-2">Chưa có đơn đặt hàng nào</div>
           ) : (
             preOrders.map(po => (
               <div 
                 key={po.id} 
                 onDoubleClick={() => handleOpenOrderModal(po)}
                 className="bg-white border border-yellow-100 p-3 rounded-lg shadow-sm flex items-center justify-between cursor-pointer hover:bg-yellow-50 transition-colors"
               >
                 <div className="flex items-center gap-3">
                    <div className="bg-yellow-100 text-yellow-800 font-bold px-2 py-1 rounded text-xs text-center min-w-[50px]">
                      {formatTime(po.deliveryTime)} <br/>
                      <span className="font-normal text-[10px]">{formatDateShort(po.deliveryTime)}</span>
                    </div>
                    <div>
                      <div className="font-bold text-gray-800">{po.customerName}</div>
                      <div className="text-xs text-gray-500">{po.productNote} {po.qtyCon ? `(${po.qtyCon} con)` : ''}</div>
                    </div>
                 </div>
                 <div className="text-gray-300">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/></svg>
                 </div>
               </div>
             ))
           )}
        </div>
      </div>

      <h3 className="font-bold text-gray-700 mb-2">Lịch sử giao dịch</h3>
      <p className="text-xs text-gray-400 mb-3 italic">* Nhấp đúp để xem chi tiết hoá đơn</p>
      
      <div className="space-y-2">
        {txns.map(t => (
          <div 
            key={t.id} 
            onDoubleClick={() => handleSelectTxn(t)}
            className="bg-white p-3 rounded shadow-sm border border-gray-100 flex justify-between items-center active:bg-gray-50 cursor-pointer"
          >
            <div className="flex-1 min-w-0 pr-2">
              <div className="flex justify-between items-baseline">
                <div className="font-medium text-gray-800 text-sm truncate">{t.description}</div>
                <div className="text-[10px] text-gray-400 whitespace-nowrap ml-2">{formatTime(t.date)} {formatDateShort(t.date)}</div>
              </div>
            </div>
            <div className={`font-bold whitespace-nowrap text-sm ${t.type === 'INCOME' ? 'text-green-600' : 'text-red-600'}`}>
               {t.type === 'INCOME' ? '+' : '-'}{Number(t.amount).toLocaleString('vi-VN')}
            </div>
          </div>
        ))}
      </div>

      {/* Transaction Details Modal */}
      <Modal isOpen={!!selectedTxn} onClose={() => setSelectedTxn(null)} title="Chi Tiết Giao Dịch">
         <div className="space-y-4">
            {selectedTxn && (
                <>
                    <div className="bg-gray-50 p-3 rounded-lg text-center">
                        <div className="text-sm text-gray-500 uppercase">{selectedTxn.type === 'INCOME' ? 'Thu Tiền' : 'Chi Tiền'}</div>
                        <div className={`text-2xl font-bold ${selectedTxn.type === 'INCOME' ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(selectedTxn.amount)}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">{new Date(selectedTxn.date).toLocaleString('vi-VN')}</div>
                    </div>
                    
                    <div className="text-sm text-gray-800 font-medium">
                        {selectedTxn.description}
                    </div>

                    {selectedInvoice && (
                        <div className="border-t border-gray-200 pt-3">
                            <h4 className="text-sm font-bold text-gray-700 mb-2">Chi tiết hoá đơn ({selectedInvoice.code})</h4>
                            <div className="text-xs text-gray-600 mb-2">
                                Thanh toán: <span className="font-bold">{getPaymentMethodLabel(selectedInvoice.paymentMethod)}</span>
                            </div>
                            <div className="space-y-2 max-h-48 overflow-y-auto bg-white border border-gray-100 rounded">
                                {selectedInvoice.lines.map((line, idx) => (
                                    <div key={idx} className="flex justify-between text-sm p-2 border-b last:border-0 border-gray-50">
                                        <div>
                                            <div className="font-medium">{line.productName}</div>
                                            <div className="text-xs text-gray-500">
                                                {line.qtyKg > 0 ? line.qtyKg + ' kg' : line.qtyCon + ' con'} x {formatCurrency(line.price)}
                                            </div>
                                        </div>
                                        <div className="font-medium">{formatCurrency(line.amount)}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}
            <Button className="w-full" onClick={() => setSelectedTxn(null)}>Đóng</Button>
         </div>
      </Modal>

      {/* PreOrder Details Modal */}
      <Modal isOpen={isOrderModalOpen} onClose={() => setIsOrderModalOpen(false)} title={selectedOrder ? "Chi tiết đặt hàng" : "Thêm đơn đặt hàng"}>
         <div className="space-y-4">
            <Input label="Tên khách hàng" value={poName} onChange={(e:any) => setPoName(e.target.value)} />
            <Input label="Số điện thoại" value={poPhone} onChange={(e:any) => setPoPhone(e.target.value)} type="tel" />
            <Input label="Thời gian giao" type="datetime-local" value={poTime} onChange={(e:any) => setPoTime(e.target.value)} />
            
            <div className="border-t border-gray-200 pt-2">
                <Input label="Loại gà / Hàng hoá" value={poProduct} onChange={(e:any) => setPoProduct(e.target.value)} placeholder="VD: Gà mái tơ, Gà cúng..." />
                <div className="flex gap-2 mt-2">
                   <div className="flex-1"><Input label="Số con" type="number" value={poCon} onChange={(e:any) => setPoCon(e.target.value)} /></div>
                   <div className="flex-1"><Input label="Số Kg (Dự kiến)" type="number" value={poKg} onChange={(e:any) => setPoKg(e.target.value)} /></div>
                </div>
            </div>
            
            <div className="flex flex-col">
               <label className="text-sm font-bold text-gray-700 mb-1">Ghi chú / Lời dặn</label>
               <textarea 
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none h-20"
                  value={poNote}
                  onChange={e => setPoNote(e.target.value)}
                  placeholder="Làm sạch, chặt miếng..."
               />
            </div>

            <div className="flex gap-2 pt-2">
               {selectedOrder ? (
                  <>
                    <Button variant="danger" className="flex-1" onClick={handleDeleteOrder}>Xoá</Button>
                    <Button variant="success" className="flex-1" onClick={handleCompleteOrder}>Đã Xong</Button>
                    <Button className="flex-1" onClick={handleSaveOrder}>Lưu Sửa</Button>
                  </>
               ) : (
                  <Button className="w-full" onClick={handleSaveOrder}>Lưu Đơn Đặt</Button>
               )}
            </div>
         </div>
      </Modal>

      {/* Settings Modal */}
      <Modal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} title="Cấu hình QR Nhận tiền">
         <div className="space-y-4">
            {settingStep === 'INPUT' ? (
              <>
                <p className="text-xs text-gray-500">Thông tin này dùng để tạo mã QR tự động.</p>
                <div>
                   <label className="text-sm font-bold text-gray-700 mb-1 block">Ngân hàng (Mã)</label>
                   <input list="banks" value={bankId} onChange={e => setBankId(e.target.value)} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 uppercase focus:outline-none" placeholder="VD: MB, VCB..." />
                   <datalist id="banks">
                      <option value="MB">MB Bank</option>
                      <option value="VCB">Vietcombank</option>
                      <option value="ICB">Vietinbank</option>
                      <option value="BIDV">BIDV</option>
                      <option value="TCB">Techcombank</option>
                      <option value="ACB">ACB</option>
                   </datalist>
                </div>
                <Input label="Số tài khoản" value={accNo} onChange={(e:any) => setAccNo(e.target.value)} />
                <Input label="Tên chủ tài khoản" value={accName} onChange={(e:any) => setAccName(e.target.value)} placeholder="NGUYEN VAN A" className="uppercase" />
                <Button className="w-full" onClick={handleCheckAccount}>Tiếp tục (Xác nhận)</Button>
              </>
            ) : (
              <div className="text-center py-4">
                 <div className="text-sm text-gray-500 mb-2">Thông tin tài khoản xác nhận:</div>
                 <div className="bg-gray-100 p-4 rounded-lg mb-4 border border-gray-200">
                    <div className="text-xl font-bold text-blue-800">{bankId}</div>
                    <div className="text-lg font-mono text-gray-800 my-1">{accNo}</div>
                    <div className="text-xl font-bold text-gray-900">{lookupName}</div>
                 </div>
                 <p className="text-sm text-gray-600 mb-4">Đây có phải tài khoản nhận tiền của bạn?</p>
                 <div className="flex gap-2">
                    <Button variant="secondary" className="flex-1" onClick={() => setSettingStep('INPUT')}>Sửa lại</Button>
                    <Button variant="success" className="flex-1" onClick={handleSaveSettings}>Đúng, Lưu lại</Button>
                 </div>
              </div>
            )}
         </div>
      </Modal>
    </div>
  )
}

function PartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [filter, setFilter] = useState<'ALL' | PartnerType>('ALL');
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formType, setFormType] = useState<PartnerType>(PartnerType.CUSTOMER);

  useEffect(() => {
    loadData();
  }, [filter]);

  const loadData = () => {
    const all = db.getPartners();
    if (filter === 'ALL') setPartners(all);
    else setPartners(all.filter(p => p.type === filter));
  }

  const handleOpenModal = (p?: Partner) => {
    if (p) {
      setEditingId(p.id);
      setFormName(p.name);
      setFormPhone(p.phone);
      setFormType(p.type);
    } else {
      setEditingId(null);
      setFormName('');
      setFormPhone('');
      setFormType(PartnerType.CUSTOMER);
    }
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (!formName) return alert("Vui lòng nhập tên");
    
    const partner: Partner = {
      id: editingId || `partner-${Date.now()}`,
      name: formName,
      phone: formPhone,
      type: formType,
      debt: editingId ? (partners.find(p => p.id === editingId)?.debt || 0) : 0
    };
    
    db.savePartner(partner);
    loadData();
    setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
    if(window.confirm("Xóa đối tác này?")) {
      db.deletePartner(id);
      // Force UI Update
      setTimeout(() => {
          loadData();
          setIsModalOpen(false);
      }, 50);
    }
  }

  return (
    <div className="pb-20">
       <div className="flex justify-between items-center mb-4">
         <h1 className="text-xl font-bold">Đối tác</h1>
         <Button onClick={() => handleOpenModal()} className="text-sm px-3 py-1">+ Thêm Mới</Button>
       </div>

       {/* Filter Pills */}
       <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar">
          <button onClick={() => setFilter('ALL')} className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${filter === 'ALL' ? 'bg-gray-800 text-white' : 'bg-gray-200 text-gray-700'}`}>Tất cả</button>
          <button onClick={() => setFilter(PartnerType.CUSTOMER)} className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${filter === PartnerType.CUSTOMER ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-700'}`}>Khách hàng</button>
          <button onClick={() => setFilter(PartnerType.SUPPLIER)} className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${filter === PartnerType.SUPPLIER ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}>Nhà cung cấp</button>
       </div>

       <div className="space-y-3">
         {partners.map(p => (
           <div key={p.id} onClick={() => handleOpenModal(p)} className="bg-white p-3 rounded shadow-sm border border-gray-100 flex justify-between items-center active:bg-gray-50 cursor-pointer">
             <div>
               <div className="font-medium flex items-center gap-2">
                 {p.name} 
                 <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide ${p.type === 'CUSTOMER' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                   {p.type === 'CUSTOMER' ? 'Khách' : 'Trại'}
                 </span>
               </div>
               <div className="text-xs text-gray-500">{p.phone || 'Không có sđt'}</div>
             </div>
             <div className="text-right">
               <div className="text-xs text-gray-500">Dư nợ</div>
               <div className={`font-bold ${p.debt > 0 ? 'text-orange-500' : 'text-gray-400'}`}>
                 {Number(p.debt).toLocaleString('vi-VN')}
               </div>
             </div>
           </div>
         ))}
       </div>

       <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? "Sửa Đối Tác" : "Thêm Đối Tác"}>
          <div className="space-y-4">
            <Select 
              label="Loại đối tác" 
              value={formType} 
              onChange={(e: any) => setFormType(e.target.value)} 
              options={[
                {value: PartnerType.CUSTOMER, label: 'Khách hàng (Người mua)'},
                {value: PartnerType.SUPPLIER, label: 'Nhà cung cấp (Trại/Cám)'}
              ]}
            />
            <Input label="Tên" value={formName} onChange={(e: any) => setFormName(e.target.value)} placeholder="Tên khách/trại..." />
            <Input label="Số điện thoại" value={formPhone} onChange={(e: any) => setFormPhone(e.target.value)} type="tel" />
            
            <div className="flex gap-2 pt-2">
              {editingId && (
                <Button variant="danger" className="flex-1" onClick={() => handleDelete(editingId)}>Xóa</Button>
              )}
              <Button className="flex-[2]" onClick={handleSave}>Lưu Thông Tin</Button>
            </div>
          </div>
       </Modal>
    </div>
  )
}

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [page, setPage] = useState('dashboard');

  useEffect(() => {
    // Check if previously logged in (optional, but requested behavior is "next time just enter code", 
    // so we can keep the user on login screen but maybe pre-fill or just check if they are already in session)
    // Here we implement basic session persistence for convenience
    const savedId = localStorage.getItem('gttd_current_business_id');
    if (savedId) {
      db.setBusinessId(savedId);
      setIsLoggedIn(true);
    }
  }, []);

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <Dashboard navigate={setPage} />;
      case 'pos': return <POS navigate={setPage} />;
      case 'inventory': return <Inventory />;
      case 'import': return <ImportPage navigate={setPage} />;
      case 'cash': return <CashbookPage />;
      case 'partners': return <PartnersPage />;
      default: return <Dashboard navigate={setPage} />;
    }
  };

  const NavItem = ({ id, label, Icon }: any) => (
    <button 
      onClick={() => setPage(id)} 
      className={`flex flex-col items-center justify-center w-full py-2 ${page === id ? 'text-brand-600' : 'text-gray-400'}`}
    >
      <Icon />
      <span className="text-[10px] font-medium mt-1">{label}</span>
    </button>
  );

  if (!isLoggedIn) {
    return <LoginScreen onLogin={() => setIsLoggedIn(true)} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
      <main className="max-w-md mx-auto min-h-screen bg-gray-50 shadow-2xl relative">
        <div className="p-4 overflow-y-auto h-full no-scrollbar pb-24">
           {renderPage()}
        </div>

        {/* Bottom Navigation for Mobile */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50 max-w-md mx-auto">
          <div className="flex justify-around items-center h-16">
            <NavItem id="dashboard" label="Tổng quan" Icon={ICONS.Home} />
            <NavItem id="inventory" label="Kho" Icon={ICONS.Inventory} />
            <div className="relative -top-5">
              <button 
                onClick={() => setPage('pos')}
                className="bg-brand-600 text-white p-4 rounded-full shadow-lg hover:bg-brand-500 transition-transform active:scale-95"
              >
                <ICONS.Plus />
              </button>
            </div>
            <NavItem id="cash" label="Sổ quỹ" Icon={ICONS.Cash} />
            <NavItem id="partners" label="Đối tác" Icon={ICONS.Users} />
          </div>
        </div>
      </main>
    </div>
  );
}