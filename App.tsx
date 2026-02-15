import React, { useState, useEffect, useRef } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import Dashboard from './pages/Dashboard';
import POS from './pages/POS';
import Inventory from './pages/Inventory';
import { ICONS, formatCurrency, formatDate} from './constants';
import { db } from './services/db';
import { Button, Input, Select, Card, Modal } from './components/ui';
import { Partner, PartnerType, BankSettings, Invoice, CashTransaction, PreOrder, PaymentMethod, Product, Gender } from './types';

// --- LOGIN COMPONENT ---
// --- LOGIN COMPONENT (ĐÃ SỬA ĐỂ KÍCH HOẠT ĐỒNG BỘ) ---
function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [code, setCode] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    if (code.length !== 6 || isNaN(Number(code))) {
      alert("Vui lòng nhập mã doanh nghiệp gồm 6 chữ số");
      return;
    }
    setIsLoading(true);
    try {
      // KIỂM TRA ONLINE TRƯỚC (QUAN TRỌNG)
      const isOnline = await db.checkBusinessOnline(code);
      
      if (!isOnline) {
        setIsConfirming(true); // Chưa có trên server -> Hỏi tạo mới
      } else {
        await db.init(code); // Có rồi -> Tải về và Sync
        onLogin();
      }
    } catch (error) {
      console.error(error);
      alert("Lỗi kết nối! Vui lòng kiểm tra mạng.");
    } finally {
      setIsLoading(false);
    }
  };

  const confirmCreate = async () => {
    setIsLoading(true);
    try {
      await db.init(code);
      
      // 👇 QUAN TRỌNG: Thêm await ở đây để chờ lưu xong lên server
      await db.seedNewBusiness(); 
      
      onLogin(); // Chỉ vào app khi đã chắc chắn dữ liệu nằm trên server
    } catch (error) {
      console.error(error);
      alert("Không thể tạo dữ liệu trên máy chủ. Vui lòng thử lại!");
    } finally {
      setIsLoading(false);
    }
  };

  if (isConfirming) {
    return (
      <div className="min-h-screen bg-brand-600 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
          <h2 className="text-xl font-bold text-gray-800 mb-2">Doanh nghiệp mới?</h2>
          <p className="text-gray-600 mb-6 text-sm">
            Mã <b>{code}</b> chưa tồn tại. Bạn có muốn tạo mới không?
          </p>
          <div className="flex gap-3">
             <Button variant="secondary" className="flex-1" onClick={() => setIsConfirming(false)}>Quay lại</Button>
             <Button className="flex-1" onClick={confirmCreate} disabled={isLoading}>
               {isLoading ? "Đang tạo..." : "Tạo mới"}
             </Button>
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
        <Button 
          className="w-full py-3 text-lg" 
          onClick={handleLogin}
          disabled={isLoading}
        >
          {isLoading ? "Đang đồng bộ..." : "Truy cập"}
        </Button>
        <p className="text-xs text-center text-gray-400 mt-4">
          Mỗi mã 6 số tương ứng với một tài khoản riêng biệt.
        </p>
      </div>
    </div>
  );
}

// --- IMPORT PAGE (PHIÊN BẢN NÂNG CẤP HÓA ĐƠN) ---
// --- IMPORT PAGE (ĐÃ FIX LỖI NÚT THÊM & TÍNH BÌ) ---
function ImportPage({ navigate }: { navigate: (p: string) => void }) {
  const [suppliers, setSuppliers] = useState<Partner[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [supplierId, setSupplierId] = useState('');
  
  // Danh sách hàng trong phiếu
  const [ticketItems, setTicketItems] = useState<{
      pid: string, pName: string, kg: number, con: number, price: number, total: number,
      gross: number, tare: number, details: string
  }[]>([]);

  // State bàn cân
  const [currentPid, setCurrentPid] = useState('');
  // w: cân, t: bì, c: con
  const [weightList, setWeightList] = useState<{w: number, t: number, c: number}[]>([]); 
  
  const [currentWeightInput, setCurrentWeightInput] = useState('');
  const [currentTareInput, setCurrentTareInput] = useState(''); 
  const [currentCountInput, setCurrentCountInput] = useState('');
  const [priceMale, setPriceMale] = useState('');
  const [priceFemale, setPriceFemale] = useState('');
  
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
  const [gender, setGender] = useState<'MALE'|'FEMALE'>('MALE');

  useEffect(() => {
    // 1. Tải danh sách Gà ngay lập tức
    const prodList = db.getProducts();
    setProducts(prodList);

    // 2. Tải danh sách Nhà cung cấp
    const supList = db.getPartners(PartnerType.SUPPLIER);
    setSuppliers(supList);
    
    // Tự động chọn nhà cung cấp đầu tiên nếu có
    if (supList.length > 0) {
        setSupplierId(supList[0].id);
    }
  }, []);


  const loadSuppliers = () => {
    const list = db.getPartners(PartnerType.SUPPLIER);
    setSuppliers(list);
    if (!supplierId && list.length > 0) setSupplierId(list[0].id);
  }

  const loadProducts = () => {
    setProducts(db.getProducts());
  }

  useEffect(() => {
    loadProducts();
    loadSuppliers();
  }, []);

  // --- 1. LOGIC TÍNH TOÁN (Tự động tính mỗi khi weightList thay đổi) ---
  const totalGrossWeight = weightList.reduce((a, b) => a + b.w, 0);
  const totalTare = weightList.reduce((a, b) => a + (b.t || 0), 0);
  const totalCon = weightList.reduce((a, b) => a + (b.c || 0), 0);
  const netWeight = Math.max(0, totalGrossWeight - totalTare);
  
  // Hàm thêm mã cân vào danh sách tạm
  const handleAddWeight = () => {
    const w = parseFloat(currentWeightInput);
    const t = parseFloat(currentTareInput) || 0; 
    const c = parseInt(currentCountInput) || 0;

    if (isNaN(w) || w <= 0) {
      alert("Vui lòng nhập số cân!");
      weightInputRef.current?.focus();
      return;
    }

    setWeightList([...weightList, { w, t, c }]);
    // Reset ô nhập để nhập tiếp
    setCurrentWeightInput('');
    setCurrentTareInput('');
    setCurrentCountInput('');
    weightInputRef.current?.focus();
  };

  const handleRemoveWeight = (index: number) => {
    const n = [...weightList];
    n.splice(index, 1);
    setWeightList(n);
  };

  // --- 2. HÀM THÊM VÀO PHIẾU (QUAN TRỌNG) ---
  // --- 2. HÀM THÊM VÀO PHIẾU (ĐÃ SỬA LOGIC GỘP DÒNG) ---
  const handleAddItemToTicket = () => {
    // Validate dữ liệu
    if (!currentPid) return alert("Chưa chọn loại gà!");
    if (weightList.length === 0) return alert("Chưa nhập mã cân nào!");
    if (netWeight <= 0) return alert("Khối lượng thực bằng 0!");
    
    // Lấy giá theo giới tính đang chọn
    const actualPrice = gender === 'MALE' ? priceMale : priceFemale;
    if (!actualPrice) return alert("Chưa nhập giá nhập!");

    const prod = products.find(p => p.id === currentPid);
    const priceNum = parseFloat(actualPrice);
    
    // Tạo chuỗi chi tiết: "50-2, 30-1"
    const detailsStr = weightList.map(i => `${i.w}${i.t > 0 ? `(-${i.t}b)` : ''}`).join(' + ');

    // Object cho dòng mới
    const newItem = {
      pid: currentPid,
      // Tên hiển thị rõ ràng Trống/Mái
      pName: `${prod ? prod.name : 'Unknown'} (${gender === 'MALE' ? 'Trống' : 'Mái'})`, 
      gender: gender,
      kg: netWeight,
      con: totalCon,
      price: priceNum,
      total: netWeight * priceNum,
      gross: totalGrossWeight,
      tare: totalTare,
      details: detailsStr
    };

    // --- LOGIC GỘP DÒNG THÔNG MINH ---
    // Chỉ gộp nếu trùng PID + trùng Giới Tính + trùng Giá
    const existingIndex = ticketItems.findIndex(item => 
        item.pid === newItem.pid && 
        item.gender === newItem.gender && 
        item.price === newItem.price
    );

    if (existingIndex >= 0) {
        // Nếu đã có dòng y hệt (cùng loại, cùng giới tính, cùng giá) -> Cộng dồn số lượng
        const updatedItems = [...ticketItems];
        const existing = updatedItems[existingIndex];
        
        updatedItems[existingIndex] = {
            ...existing,
            kg: existing.kg + newItem.kg,
            con: existing.con + newItem.con,
            total: existing.total + newItem.total, // Cộng tiền
            gross: existing.gross + newItem.gross,
            tare: existing.tare + newItem.tare,
            details: `${existing.details} + ${newItem.details}` // Nối chi tiết cân
        };
        setTicketItems(updatedItems);
    } else {
        // Nếu khác (VD: khác giới tính hoặc khác giá) -> Thêm dòng mới
        setTicketItems([...ticketItems, newItem]);
    }

    // Reset bàn cân sau khi thêm xong
    setWeightList([]);
    setCurrentWeightInput('');
    setCurrentTareInput('');
    setCurrentCountInput('');
    // Lưu ý: Không reset giá và giới tính để tiện nhập mã cân tiếp theo
  };

  const handleRemoveTicketItem = (idx: number) => {
    const n = [...ticketItems];
    n.splice(idx, 1);
    setTicketItems(n);
  }

  const handleImport = async () => {
    if(ticketItems.length === 0) return alert('Chưa có hàng hoá nào');
    if(!supplierId) return alert('Chọn nhà cung cấp');

    await db.createPurchase(supplierId, new Date().toISOString().split('T')[0], 
      ticketItems.map(i => ({ 
        productId: i.pid, 
        qtyKg: i.kg, 
        qtyCon: i.con, 
        price: i.price,
        gender: i.gender
      })),
      0, 0
    );
    alert('Đã lưu phiếu nhập mua!');
    
    navigate('inventory');
  }

  // Helpers
  const handleAddSupplier = () => {
    if (!newSupName) return;
    const newSup: Partner = { id: `s-${Date.now()}`, name: newSupName, phone: newSupPhone, type: PartnerType.SUPPLIER, debt: 0 };
    db.savePartner(newSup); loadSuppliers(); setSupplierId(newSup.id); setIsSupModalOpen(false); setNewSupName(''); setNewSupPhone('');
  };

  const handleDeleteSupplier = () => {
     if (!supplierId) return;
     if (window.confirm("Xoá nhà cung cấp này?")) {
        db.deletePartner(supplierId);
        setTimeout(() => { const list = db.getPartners(PartnerType.SUPPLIER); setSuppliers(list); setSupplierId(list.length > 0 ? list[0].id : ''); }, 50);
     }
  }

  const handleOpenProdModal = (pid?: string) => {
    if (pid) {
      const p = products.find(x => x.id === pid);
      if (p) {
        setEditingProduct(p);
        setProdName(p.name);
        // SỬA: Thay defaultPrice bằng priceMale
        setProdPrice(p.priceMale ? p.priceMale.toString() : '');
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
    
    // SỬA: Cập nhật cấu trúc object newProduct
    const newProduct: Product = {
      id: editingProduct ? editingProduct.id : `p-${Date.now()}`,
      name: prodName,
      // Vì modal thêm nhanh chỉ có 1 ô nhập giá, ta tạm gán vào giá bán Trống
      priceMale: Number(prodPrice) || 0,
      priceFemale: 0, // Mặc định 0
      costMale: 0,    // Mặc định 0
      costFemale: 0   // Mặc định 0
    };
    
    db.saveProduct(newProduct);
    loadProducts();
    if (!editingProduct) setCurrentPid(newProduct.id);
    setIsProdModalOpen(false);
  }

  const currentSupplier = suppliers.find(s => s.id === supplierId);

  return (
    <div className="pb-24">
      <h1 className="text-xl font-bold mb-4 flex items-center gap-2 text-brand-900">
        <ICONS.Inventory /> Nhập Hàng
      </h1>

      {/* 1. SUPPLIER SELECT */}
      <Card className="mb-4 bg-blue-50 border-blue-100">
         <div className="flex justify-between items-center mb-1">
            <label className="text-xs font-bold text-blue-800 uppercase">Nhà Cung Cấp</label>
            {supplierId && <button onClick={handleDeleteSupplier} className="text-red-400 text-xs">Xoá</button>}
         </div>
         <div className="flex gap-2">
           <div className="flex-1">
              <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-full px-3 py-3 bg-white border border-blue-200 rounded-lg text-gray-800 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm">
                 {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
           </div>
           <button onClick={() => setIsSupModalOpen(true)} className="px-4 bg-blue-600 text-white rounded-lg font-bold shadow-sm">+</button>
         </div>
      </Card>

      {/* 2. WEIGHING CALCULATOR */}
      <Card className="mb-6 border-brand-200 shadow-md">
        <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-brand-800 flex items-center gap-2"><span>⚖️ Bàn Cân (Chi tiết)</span></h3>
            <div className="text-xs text-gray-500 italic">Nhập: Cân tổng - Bì - Số con</div>
        </div>

        {/* Product Select MỚI - CÓ CHỌN GIỚI TÍNH */}
        <div className="flex gap-2 mb-3">
             <div className="flex-[2]">
                <select className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500" value={currentPid} onChange={e => setCurrentPid(e.target.value)}>
                  <option value="">-- Chọn Loại Gà --</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
             </div>
             
             {/* Nút Toggle Trống / Mái */}
             <div className="flex bg-gray-100 rounded-lg p-1 border border-gray-200">
                <button 
                    onClick={() => setGender('MALE')}
                    className={`px-3 py-1 rounded text-xs font-bold transition-all ${gender === 'MALE' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-gray-600'}`}
                >
                    TRỐNG
                </button>
                <button 
                    onClick={() => setGender('FEMALE')}
                    className={`px-3 py-1 rounded text-xs font-bold transition-all ${gender === 'FEMALE' ? 'bg-pink-500 text-white shadow' : 'text-gray-400 hover:text-gray-600'}`}
                >
                    MÁI
                </button>
             </div>

             <button onClick={() => handleOpenProdModal(currentPid)} className={`px-3 rounded-lg border ${currentPid ? 'bg-gray-100' : 'bg-brand-600 text-white font-bold'}`}>{currentPid ? '✎' : '+'}</button>
        </div>

        {/* Weighing Input - 3 Ô NHẬP LIỆU */}
        <div className="flex gap-2 mb-3 items-end">
            <div className="flex-[2]">
                 <label className="text-[10px] text-gray-500 font-bold ml-1">TỔNG KG</label>
                 <input ref={weightInputRef} type="number" placeholder="0.0" className="w-full px-2 py-2 text-lg font-bold text-gray-800 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none" value={currentWeightInput} onChange={e => setCurrentWeightInput(e.target.value)} />
            </div>
            <div className="flex-1">
                 <label className="text-[10px] text-red-500 font-bold ml-1">BÌ (KG)</label>
                 <input type="number" placeholder="0" className="w-full px-2 py-2 text-lg font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:outline-none" value={currentTareInput} onChange={e => setCurrentTareInput(e.target.value)} />
            </div>
            <div className="flex-1">
                 <label className="text-[10px] text-gray-500 font-bold ml-1">CON</label>
                 <input ref={countInputRef} type="number" placeholder="0" className="w-full px-2 py-2 text-lg font-bold text-center text-gray-800 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none" value={currentCountInput} onChange={e => setCurrentCountInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAddWeight(); }} />
            </div>
            {/* Nút Enter thêm mã cân */}
            <Button onClick={handleAddWeight} className="h-[46px] w-12 flex items-center justify-center">↵</Button>
        </div>

        {/* List Chips */}
        {weightList.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4 p-2 bg-gray-50 rounded-lg border border-gray-100 max-h-32 overflow-y-auto">
                {weightList.map((item, i) => (
                    <span key={i} className="inline-flex items-center px-2 py-1 rounded-md text-sm font-medium bg-white border border-gray-200 shadow-sm text-gray-700">
                        {item.w} <span className="text-red-400 text-xs mx-1">-{item.t}bì</span>
                        <span className="text-gray-400 text-xs">({item.c}c)</span>
                        <button onClick={() => handleRemoveWeight(i)} className="ml-1 text-red-500 font-bold">×</button>
                    </span>
                ))}
            </div>
        )}

        {/* Calculation Grid */}
        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
            <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500">Tổng cân (Gross):</span>
                <span className="font-bold text-gray-800">{totalGrossWeight.toFixed(2)} kg</span>
            </div>
            <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500">Tổng trừ bì:</span>
                <span className="font-bold text-red-500">-{totalTare.toFixed(2)} kg</span>
            </div>
            <div className="border-t border-gray-300 pt-2 flex justify-between items-center">
                <span className="font-bold text-brand-700 text-lg">Thực Nhập (Net):</span>
                <span className="text-2xl font-bold text-brand-600">{netWeight.toFixed(2)} kg</span>
            </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4">
             <Input label="Giá nhập / kg" type="number" value={gender === 'MALE' ? priceMale : priceFemale} onChange={(e: any) => gender === 'MALE' ? setPriceMale(e.target.value) : setPriceFemale(e.target.value)} className="font-bold" placeholder="0" />
             <div className="flex flex-col">
                <label className="text-sm font-bold text-gray-700 mb-1">Tổng số con</label>
                <div className="w-full px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-gray-800 font-bold">
                    {totalCon}
                </div>
             </div>
        </div>
        
        <div className="mt-4 pt-2 border-t border-dashed border-gray-200">
             {/* Nút bấm ĐÃ FIX: Gọi trực tiếp hàm handleAddItemToTicket */}
             <Button onClick={handleAddItemToTicket} className="w-full py-3 text-lg">⬇ Thêm Vào Phiếu</Button>
        </div>
      </Card>

      {/* 3. TICKET PREVIEW */}
      {ticketItems.length > 0 && (
          <div className="bg-white rounded-none shadow-lg border border-gray-300 overflow-hidden mb-20 relative">
             <div className="bg-white p-4 text-center border-b border-gray-300 border-dashed">
                 <h2 className="text-xl font-extrabold text-gray-800 uppercase tracking-widest">Phiếu Nhập Hàng</h2>
                 <p className="text-xs text-gray-500 mt-1">{new Date().toLocaleString('vi-VN')}</p>
                 <div className="mt-3 text-left bg-gray-50 p-2 rounded text-sm border border-gray-200">
                    <div><span className="font-bold text-gray-600">NCC:</span> {currentSupplier?.name}</div>
                    <div><span className="font-bold text-gray-600">SĐT:</span> {currentSupplier?.phone}</div>
                 </div>
             </div>

             <div className="p-2">
                {ticketItems.map((item, idx) => (
                    <div key={idx} className="mb-4 border border-gray-200 rounded-md overflow-hidden text-sm">
                        <div className="bg-gray-100 px-3 py-2 font-bold text-gray-800 flex justify-between">
                            <span>{idx + 1}. {item.pName}</span>
                            <button onClick={() => handleRemoveTicketItem(idx)} className="text-red-500 text-xs font-normal underline">Xóa</button>
                        </div>
                        <div className="p-3 grid grid-cols-2 gap-y-1 gap-x-4 text-gray-600">
                            <div>Tổng cân: <span className="font-bold text-gray-800">{item.gross} kg</span></div>
                            <div>Trừ bì: <span className="font-bold text-red-600">-{item.tare} kg</span></div>
                            <div className="col-span-2 border-b border-gray-100 my-1"></div>
                            <div>Thực nhập: <span className="font-bold text-blue-600">{item.kg} kg</span></div>
                            <div>Số lượng: <span className="font-bold text-blue-600">{item.con} con</span></div>
                            <div className="col-span-2 text-xs italic text-gray-400 mt-1">Chi tiết: {item.details}</div>
                            <div className="col-span-2 border-t border-gray-200 mt-2 pt-2 flex justify-between items-center">
                                <span>Đơn giá: {formatCurrency(item.price)}</span>
                                <span className="text-lg font-bold text-gray-800">{formatCurrency(item.total)}</span>
                            </div>
                        </div>
                    </div>
                ))}
             </div>

             <div className="bg-gray-800 text-white p-4">
                 <div className="flex justify-between items-center text-sm mb-1">
                     <span className="text-gray-300">Tổng bì (lồng):</span>
                     <span>{ticketItems.reduce((a, b) => a + b.tare, 0).toFixed(2)} kg</span>
                 </div>
                 <div className="flex justify-between items-center text-sm mb-3">
                     <span className="text-gray-300">Tổng thực nhập:</span>
                     <span>{ticketItems.reduce((a, b) => a + b.kg, 0).toFixed(2)} kg</span>
                 </div>
                 <div className="border-t border-gray-600 pt-3 flex justify-between items-center">
                     <span className="font-bold text-lg uppercase">Tổng Tiền:</span>
                     <span className="text-2xl font-bold text-yellow-400">
                        {formatCurrency(ticketItems.reduce((a, b) => a + b.total, 0))}
                     </span>
                 </div>
                 <Button onClick={handleImport} className="w-full mt-4 bg-yellow-500 hover:bg-yellow-600 text-black font-bold border-none">LƯU & KẾT THÚC</Button>
             </div>
             
             <div className="absolute top-full left-0 right-0 h-4 bg-transparent" style={{background: 'radial-gradient(circle, transparent 50%, white 50%)', backgroundSize: '10px 10px'}}></div>
          </div>
      )}

      {/* Modals (Giữ nguyên) */}
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
// --- CASHBOOK PAGE (PHIÊN BẢN NÂNG CẤP: TAB THÁNG/NĂM & BÁO CÁO) ---
function CashbookPage() {
  const [txns, setTxns] = useState(db.getCashTransactions());
  const [invoices, setInvoices] = useState(db.getInvoices());
  // State quản lý chế độ xem: 'MONTH' hoặc 'YEAR'
  const [viewMode, setViewMode] = useState<'MONTH' | 'YEAR'>('MONTH');
  // State quản lý thời gian đang chọn (mặc định là hôm nay)
  const [targetDate, setTargetDate] = useState(new Date());

  const [totalReceivables, setTotalReceivables] = useState(0);
  const [chartData, setChartData] = useState<any[]>([]);
  
  // Detail Modal & Settings Modal & PreOrder (Giữ nguyên logic cũ)
  const [selectedTxn, setSelectedTxn] = useState<CashTransaction | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | undefined>(undefined);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingStep, setSettingStep] = useState<'INPUT' | 'CONFIRM'>('INPUT');
  const [bankId, setBankId] = useState('');
  const [accNo, setAccNo] = useState('');
  const [accName, setAccName] = useState('');
  const [lookupName, setLookupName] = useState('');
  const [preOrders, setPreOrders] = useState<PreOrder[]>([]);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<PreOrder | null>(null);
  
  // State form PreOrder
  const [poName, setPoName] = useState('');
  const [poPhone, setPoPhone] = useState('');
  const [poProduct, setPoProduct] = useState('');
  const [poCon, setPoCon] = useState('');
  const [poKg, setPoKg] = useState('');
  const [poTime, setPoTime] = useState('');
  const [poNote, setPoNote] = useState('');

  // State Modal Báo cáo
  const [isReportOpen, setIsReportOpen] = useState(false);

  // --- 1. LOGIC LỌC DỮ LIỆU THEO THỜI GIAN ---
  const getFilteredTxns = () => {
    return txns.filter(t => {
      const tDate = new Date(t.date);
      if (viewMode === 'MONTH') {
        // So sánh tháng và năm
        return tDate.getMonth() === targetDate.getMonth() && 
               tDate.getFullYear() === targetDate.getFullYear();
      } else {
        // Chỉ so sánh năm
        return tDate.getFullYear() === targetDate.getFullYear();
      }
    });
  };

  // --- 1.5. LOGIC TRỘN TRANSACTION + DEBT INVOICE ---
  const getMixedList = () => {
    // 1. Lấy Giao dịch tiền mặt (Logic lọc cũ)
    const filteredTxns = getFilteredTxns();

    // 2. Lấy Hoá đơn nợ (Logic mới)
    const filteredDebts = invoices.filter(i => {
      if (i.debtAmount <= 0) return false; // Chỉ lấy hoá đơn có nợ
      const iDate = new Date(i.date);
      if (viewMode === 'MONTH') {
        return iDate.getMonth() === targetDate.getMonth() && iDate.getFullYear() === targetDate.getFullYear();
      }
      return iDate.getFullYear() === targetDate.getFullYear();
    });

    // 3. Map hoá đơn nợ sang cấu trúc giống transaction để hiển thị chung
    const formattedDebts = filteredDebts.map(i => ({
      id: i.id,
      date: i.date,
      amount: i.debtAmount, // Hiển thị số nợ
      type: 'DEBT' as any,         // Đánh dấu là Nợ
      description: `Ghi nợ: ${i.partnerName} (${i.code})`,
      refId: i.id           // Quan trọng: refId trỏ về chính nó để mở chi tiết
    }));

    // 4. Gộp và sắp xếp mới nhất lên đầu
    return [...filteredTxns, ...formattedDebts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const mixedList = getMixedList();


  // Tính toán số liệu dựa trên danh sách đã lọc
  const filteredTxns = getFilteredTxns();
  const periodIncome = filteredTxns.filter(t => t.type === 'INCOME').reduce((s, t) => s + t.amount, 0);
  const periodExpense = filteredTxns.filter(t => t.type === 'EXPENSE').reduce((s, t) => s + t.amount, 0);
  const periodBalance = periodIncome - periodExpense;

  useEffect(() => {
    // Cập nhật lại các dữ liệu phụ (Nợ, Cài đặt bank, Đơn đặt hàng)
    const customers = db.getPartners(PartnerType.CUSTOMER);
    setTotalReceivables(customers.reduce((sum, c) => sum + c.debt, 0));

    const bs = db.getBankSettings();
    if (bs) { setBankId(bs.bankId); setAccNo(bs.accountNo); setAccName(bs.accountName); }
    
    setPreOrders(db.getPreOrders().filter(o => o.status === 'PENDING'));

    // --- LOGIC BIỂU ĐỒ (Cập nhật theo viewMode) ---
    prepareChartData();
  }, [txns, targetDate, viewMode]);

  const prepareChartData = () => {
    // Nếu xem Tháng: Hiển thị từng ngày trong tháng
    // Nếu xem Năm: Hiển thị 12 tháng
    let data = [];
    
    if (viewMode === 'MONTH') {
        const daysInMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0).getDate();
        for (let i = 1; i <= daysInMonth; i++) {
            const currentDayStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            const dayTxns = txns.filter(t => t.date.startsWith(currentDayStr));
            data.push({
                date: `${i}/${targetDate.getMonth() + 1}`,
                Thu: dayTxns.filter(t => t.type === 'INCOME').reduce((s, t) => s + t.amount, 0),
                Chi: dayTxns.filter(t => t.type === 'EXPENSE').reduce((s, t) => s + t.amount, 0),
            });
        }
    } else {
        for (let i = 0; i < 12; i++) {
            const monthTxns = txns.filter(t => {
                const d = new Date(t.date);
                return d.getMonth() === i && d.getFullYear() === targetDate.getFullYear();
            });
            data.push({
                date: `T${i + 1}`,
                Thu: monthTxns.filter(t => t.type === 'INCOME').reduce((s, t) => s + t.amount, 0),
                Chi: monthTxns.filter(t => t.type === 'EXPENSE').reduce((s, t) => s + t.amount, 0),
            });
        }
    }
    setChartData(data);
  };

  // --- NAVIGATION HANDLERS ---
  const handlePrev = () => {
    const newDate = new Date(targetDate);
    if (viewMode === 'MONTH') newDate.setMonth(newDate.getMonth() - 1);
    else newDate.setFullYear(newDate.getFullYear() - 1);
    setTargetDate(newDate);
  };

  const handleNext = () => {
    const newDate = new Date(targetDate);
    if (viewMode === 'MONTH') newDate.setMonth(newDate.getMonth() + 1);
    else newDate.setFullYear(newDate.getFullYear() + 1);
    setTargetDate(newDate);
  };

  const getTitle = () => {
    if (viewMode === 'MONTH') return `Tháng ${targetDate.getMonth() + 1} / ${targetDate.getFullYear()}`;
    return `Năm ${targetDate.getFullYear()}`;
  };

  // --- REPORT GENERATION ---
  const ReportModal = () => {
    if (!isReportOpen) return null;
    
    // Tìm top chi phí
    const expenses = filteredTxns.filter(t => t.type === 'EXPENSE');
    // Gom nhóm chi phí theo mô tả (đơn giản)
    
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 px-4">
         <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b bg-brand-600 text-white flex justify-between items-center">
                <h3 className="font-bold text-lg">BÁO CÁO DOANH THU</h3>
                <button onClick={() => setIsReportOpen(false)} className="text-white text-2xl">&times;</button>
            </div>
            <div className="p-6 overflow-y-auto">
                <div className="text-center mb-6 border-b border-dashed pb-4">
                    <h2 className="text-xl font-bold text-gray-800 uppercase">Gà Thịt Thảo Dương</h2>
                    <p className="text-sm text-gray-500">Báo cáo {viewMode === 'MONTH' ? 'Tháng' : 'Năm'}: {getTitle()}</p>
                    <p className="text-xs text-gray-400">Xuất ngày: {new Date().toLocaleString('vi-VN')}</p>
                </div>

                <div className="space-y-3 font-mono text-sm text-gray-700">
                    <div className="flex justify-between">
                        <span>1. Tổng Thu (Doanh số):</span>
                        <span className="font-bold text-green-600">{formatCurrency(periodIncome)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>2. Tổng Chi (Nhập/Phí):</span>
                        <span className="font-bold text-red-600">{formatCurrency(periodExpense)}</span>
                    </div>
                    <div className="border-t border-gray-300 my-2"></div>
                    <div className="flex justify-between text-lg">
                        <span className="font-bold">3. LỢI NHUẬN RÒNG:</span>
                        <span className={`font-bold ${periodBalance >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                            {formatCurrency(periodBalance)}
                        </span>
                    </div>
                </div>

                <div className="mt-6 bg-yellow-50 p-3 rounded text-xs text-gray-600 border border-yellow-200">
                    <span className="font-bold">Ghi chú:</span> <br/>
                    - Tổng khách nợ hiện tại (toàn thời gian): <b className="text-orange-600">{formatCurrency(totalReceivables)}</b>. <br/>
                    - Số dư này chỉ tính toán dựa trên các giao dịch Tiền mặt/Chuyển khoản thực tế trong kỳ.
                </div>
            </div>
            <div className="p-4 border-t bg-gray-50">
                <Button className="w-full" onClick={() => { alert('Đã sao chép nội dung!'); setIsReportOpen(false); }}>Sao Chép / In</Button>
            </div>
         </div>
      </div>
    )
  }

  // --- GIỮ NGUYÊN CÁC HÀM XỬ LÝ SỰ KIỆN CŨ (Settings, PreOrder...) ---
  const handleOpenSettings = () => {
    setSettingStep('INPUT');
    const bs = db.getBankSettings();
    if (bs) { setBankId(bs.bankId); setAccNo(bs.accountNo); setAccName(bs.accountName); }
    setIsSettingsOpen(true);
  }
  const handleCheckAccount = () => {
    if (!bankId || !accNo || !accName) return alert("Vui lòng nhập đủ thông tin");
    setTimeout(() => { setLookupName(accName.toUpperCase()); setSettingStep('CONFIRM'); }, 500);
  }
  const handleSaveSettings = () => {
     db.saveBankSettings({ bankId: bankId.toUpperCase(), accountNo: accNo, accountName: lookupName.toUpperCase(), template: 'compact' });
     setIsSettingsOpen(false);
  }
  const handleSelectTxn = (txn: CashTransaction) => {
    setSelectedTxn(txn);
    if (txn.refId) setSelectedInvoice(db.getInvoice(txn.refId));
    else setSelectedInvoice(undefined);
  }
  // PreOrder Logic (Giữ nguyên)
  const handleOpenOrderModal = (order?: PreOrder) => {
    if (order) {
      setSelectedOrder(order); setPoName(order.customerName); setPoPhone(order.phone || '');
      setPoProduct(order.productNote); setPoCon(order.qtyCon?.toString() || ''); setPoKg(order.qtyKg?.toString() || '');
      setPoTime(order.deliveryTime); setPoNote(order.note || '');
    } else {
      setSelectedOrder(null); setPoName(''); setPoPhone(''); setPoProduct(''); setPoCon(''); setPoKg('');
      const now = new Date(); now.setHours(now.getHours() + 1); now.setMinutes(0); setPoTime(now.toISOString().slice(0, 16)); setPoNote('');
    }
    setIsOrderModalOpen(true);
  }
  const handleSaveOrder = () => {
    if (!poName || !poTime) return alert("Cần nhập tên khách và giờ hẹn");
    const order: PreOrder = {
      id: selectedOrder ? selectedOrder.id : `po-${Date.now()}`, customerName: poName, phone: poPhone,
      productNote: poProduct, qtyCon: Number(poCon) || 0, qtyKg: Number(poKg) || 0, deliveryTime: poTime, note: poNote, status: 'PENDING'
    };
    db.savePreOrder(order); setPreOrders(db.getPreOrders().filter(o => o.status === 'PENDING')); setIsOrderModalOpen(false);
  }
  const handleDeleteOrder = () => {
    if (!selectedOrder) return;
    if (confirm("Xoá đơn đặt hàng này?")) {
      db.deletePreOrder(selectedOrder.id); setPreOrders(db.getPreOrders().filter(o => o.status === 'PENDING')); setIsOrderModalOpen(false);
    }
  }
  const handleCompleteOrder = () => {
    if (!selectedOrder) return;
    const completed = { ...selectedOrder, status: 'DONE' as const };
    db.savePreOrder(completed); setPreOrders(db.getPreOrders().filter(o => o.status === 'PENDING')); setIsOrderModalOpen(false);
  }
  const formatTime = (isoString: string) => { try { const d = new Date(isoString); return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`; } catch(e) { return ''; } }
  const formatDateShort = (isoString: string) => { try { const d = new Date(isoString); return `${d.getDate()}/${d.getMonth()+1}`; } catch (e) { return ''; } }

  return (
    <div className="pb-20">
      {/* HEADER & TABS */}
      <div className="flex justify-between items-center mb-4">
         <h1 className="text-xl font-bold">Sổ Quỹ</h1>
         <div className="flex gap-2">
            <button onClick={() => setIsReportOpen(true)} className="text-sm bg-blue-100 text-blue-700 font-bold px-3 py-1 rounded-lg">
                📄 Xuất Báo Cáo
            </button>
            <button onClick={handleOpenSettings} className="text-sm text-gray-500 font-medium bg-gray-100 px-3 py-1 rounded-lg">
                ⚙ QR
            </button>
         </div>
      </div>

      {/* 1. THANH ĐIỀU HƯỚNG THỜI GIAN & TAB */}
      <Card className="mb-4 p-2 bg-brand-50 border-brand-100">
        <div className="flex bg-white rounded-lg p-1 shadow-sm border border-gray-100 mb-3">
            <button 
            onClick={() => { setViewMode('MONTH'); setTargetDate(new Date()); }}
            className={`flex-1 py-1.5 text-xs font-bold uppercase rounded-md transition-all ${viewMode === 'MONTH' ? 'bg-brand-600 text-white shadow' : 'text-gray-500 hover:bg-gray-50'}`}
            >
            Theo Tháng
            </button>
            <button 
            onClick={() => { setViewMode('YEAR'); setTargetDate(new Date()); }}
            className={`flex-1 py-1.5 text-xs font-bold uppercase rounded-md transition-all ${viewMode === 'YEAR' ? 'bg-brand-600 text-white shadow' : 'text-gray-500 hover:bg-gray-50'}`}
            >
            Theo Năm
            </button>
        </div>

        <div className="flex items-center justify-between bg-white rounded-lg px-2 py-2 border border-gray-200">
            <button onClick={handlePrev} className="p-2 hover:bg-gray-100 rounded-full text-brand-700 font-bold">❮</button>
            <div className="text-center">
                <span className="text-xs text-gray-400 font-medium uppercase block">{viewMode === 'MONTH' ? 'Tháng Đang Xem' : 'Năm Tài Chính'}</span>
                <span className="text-lg font-black text-gray-800">{getTitle()}</span>
            </div>
            <button onClick={handleNext} className="p-2 hover:bg-gray-100 rounded-full text-brand-700 font-bold">❯</button>
        </div>
      </Card>

      {/* 2. SUMMARY CARDS (ĐÃ CẬP NHẬT THEO BỘ LỌC) */}
      <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100">
              <div className="text-xs text-gray-500 uppercase font-bold">TỔNG THU ({viewMode === 'MONTH' ? 'THÁNG' : 'NĂM'})</div>
              <div className="text-lg font-bold text-green-600">{formatCurrency(periodIncome)}</div>
          </div>
          <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100">
              <div className="text-xs text-gray-500 uppercase font-bold">TỔNG CHI ({viewMode === 'MONTH' ? 'THÁNG' : 'NĂM'})</div>
              <div className="text-lg font-bold text-red-600">{formatCurrency(periodExpense)}</div>
          </div>
          <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100">
              <div className="text-xs text-gray-500 uppercase font-bold">LỢI NHUẬN</div>
              <div className={`text-lg font-bold ${periodBalance >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                {formatCurrency(periodBalance)}
              </div>
          </div>
           <div className="bg-orange-50 p-3 rounded-lg shadow-sm border border-orange-100">
              <div className="text-xs text-orange-800 uppercase font-bold">KHÁCH NỢ (HIỆN TẠI)</div>
              <div className="text-lg font-bold text-orange-600">{formatCurrency(totalReceivables)}</div>
          </div>
      </div>

      <Card title={`Biểu đồ ${viewMode === 'MONTH' ? 'Tháng' : 'Năm'}`} className="mb-4 h-64">
         <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
               <CartesianGrid strokeDasharray="3 3" vertical={false} />
               <XAxis dataKey="date" fontSize={10} tickMargin={5} minTickGap={10} />
               <YAxis hide />
               <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{fontSize: '12px'}} />
               <Bar dataKey="Thu" fill="#22c55e" radius={[2, 2, 0, 0]} stackId="a" />
               <Bar dataKey="Chi" fill="#ef4444" radius={[2, 2, 0, 0]} stackId="a" />
            </BarChart>
         </ResponsiveContainer>
      </Card>

      {/* PRE-ORDERS (Giữ nguyên) */}
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
                 <div className="text-gray-300"><ICONS.Plus /></div>
               </div>
             ))
           )}
        </div>
      </div>

      {/* TRANSACTION LIST (Đã lọc theo thời gian) */}
      <h3 className="font-bold text-gray-700 mb-2">Lịch sử giao dịch ({mixedList.length})</h3>
      
      <div className="space-y-2">
        {mixedList.length === 0 ? <p className="text-sm text-gray-400 italic text-center py-4">Không có giao dịch trong kỳ này</p> :
        mixedList.map(t => (
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
            <div className={`font-bold whitespace-nowrap text-sm ${
                t.type === 'INCOME' ? 'text-green-600' : 
                t.type === 'DEBT' ? 'text-orange-500' : 'text-red-600'
            }`}>
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
                        <div className="text-sm text-gray-500 uppercase">{selectedTxn.type === 'INCOME' ? 'Thu Tiền' : selectedTxn.type === 'DEBT' ? 'Ghi Nợ' : 'Chi Tiền'}</div>
                        <div className={`text-2xl font-bold ${
                            selectedTxn.type === 'INCOME' ? 'text-green-600' : 
                            selectedTxn.type === 'DEBT' ? 'text-orange-600' : 'text-red-600'
                        }`}>
                            {formatCurrency(selectedTxn.amount)}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">{new Date(selectedTxn.date).toLocaleString('vi-VN')}</div>
                    </div>
                    <div className="text-sm text-gray-800 font-medium">{selectedTxn.description}</div>
                    {selectedInvoice && (
                        <div className="space-y-3 max-h-60 overflow-y-auto bg-white border border-gray-100 rounded p-2">
                            {selectedInvoice.lines.map((line, idx) => (
                                <div key={idx} className="flex flex-col p-3 border-b last:border-0 border-gray-100 bg-gray-50 rounded mb-2">
                                    <div className="flex justify-between w-full mb-2">
                                        <div className="font-bold text-lg text-gray-800">{line.productName}</div>
                                        <div className="font-bold text-lg text-blue-600">{formatCurrency(line.amount)}</div>
                                    </div>
                                    <div className="flex justify-between text-base text-gray-700 font-medium">
                                        <span>{line.qtyKg} kg | {line.qtyCon} con</span>
                                        <span>Giá: {formatCurrency(line.price)}</span>
                                    </div>
                                </div>
                            ))}
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
                <Input label="Loại gà / Hàng hoá" value={poProduct} onChange={(e:any) => setPoProduct(e.target.value)} />
                <div className="flex gap-2 mt-2">
                   <div className="flex-1"><Input label="Số con" type="number" value={poCon} onChange={(e:any) => setPoCon(e.target.value)} /></div>
                   <div className="flex-1"><Input label="Số Kg" type="number" value={poKg} onChange={(e:any) => setPoKg(e.target.value)} /></div>
                </div>
            </div>
            <textarea className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white" value={poNote} onChange={e => setPoNote(e.target.value)} placeholder="Ghi chú..." />
            <div className="flex gap-2 pt-2">
               {selectedOrder ? (
                  <>
                    <Button variant="danger" className="flex-1" onClick={handleDeleteOrder}>Xoá</Button>
                    <Button variant="success" className="flex-1" onClick={handleCompleteOrder}>Đã Xong</Button>
                    <Button className="flex-1" onClick={handleSaveOrder}>Lưu Sửa</Button>
                  </>
               ) : <Button className="w-full" onClick={handleSaveOrder}>Lưu Đơn Đặt</Button>}
            </div>
         </div>
      </Modal>

      {/* Settings Modal */}
      <Modal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} title="Cấu hình QR Nhận tiền">
         <div className="space-y-4">
            {settingStep === 'INPUT' ? (
              <>
                <Input label="Ngân hàng (Mã)" placeholder="MB, VCB..." value={bankId} onChange={(e:any) => setBankId(e.target.value)} />
                <Input label="Số tài khoản" value={accNo} onChange={(e:any) => setAccNo(e.target.value)} />
                <Input label="Tên chủ tài khoản" value={accName} onChange={(e:any) => setAccName(e.target.value)} className="uppercase" />
                <Button className="w-full" onClick={handleCheckAccount}>Tiếp tục</Button>
              </>
            ) : (
              <div className="text-center py-4">
                 <div className="bg-gray-100 p-4 rounded-lg mb-4"><div className="text-xl font-bold">{bankId} - {accNo}</div><div className="text-lg">{lookupName}</div></div>
                 <div className="flex gap-2"><Button variant="secondary" className="flex-1" onClick={() => setSettingStep('INPUT')}>Sửa lại</Button><Button variant="success" className="flex-1" onClick={handleSaveSettings}>Lưu</Button></div>
              </div>
            )}
         </div>
      </Modal>
      
      {/* RENDER MODAL BÁO CÁO */}
      <ReportModal />
    </div>
  )
}

function PartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [debtFilter, setDebtFilter] = useState<'ALL' | 'HAS_DEBT' | 'NO_DEBT'>('ALL');
  const [nameFilter, setNameFilter] = useState<'ALL' | 'A_Z' | 'Z_A'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal Add/Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formType, setFormType] = useState<PartnerType>(PartnerType.CUSTOMER);
  const [formDebt, setFormDebt] = useState('0');

  // Modal Detail & Pay Debt
  const [detailPartner, setDetailPartner] = useState<Partner | null>(null);
  const [partnerInvoices, setPartnerInvoices] = useState<Invoice[]>([]);
  const [payAmount, setPayAmount] = useState('');
  const [isPayMode, setIsPayMode] = useState(false);
  
  // Modal Chi tiết hoá đơn
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);

  useEffect(() => {
    loadData();
  }, [debtFilter, nameFilter, searchTerm]);

  const loadData = () => {
    let list = db.getPartners();

    if (debtFilter === 'HAS_DEBT') {
      list = list.filter(p => p.debt > 0);
    } else if (debtFilter === 'NO_DEBT') {
      list = list.filter(p => p.debt <= 0);
    }

    const keyword = searchTerm.trim().toLowerCase();
    if (keyword) {
      list = list.filter(p =>
        p.name.toLowerCase().includes(keyword) ||
        (p.phone || '').toLowerCase().includes(keyword)
      );
    }

    if (nameFilter === 'A_Z') {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' }));
    } else if (nameFilter === 'Z_A') {
      list = [...list].sort((a, b) => b.name.localeCompare(a.name, 'vi', { sensitivity: 'base' }));
    }

    setPartners(list);
  }

  // --- Logic Detail & Pay ---
  const handleOpenDetail = (p: Partner) => {
    setDetailPartner(p);
    setIsPayMode(false);
    setPayAmount('');
    
    // Lấy danh sách hóa đơn còn nợ của khách này
    const invoices = db.getInvoices().filter(i => 
      i.partnerId === p.id && 
      i.type === 'EXPORT' && 
      i.debtAmount > 0
    );
    setPartnerInvoices(invoices);
  };

  const handleSettleDebt = async () => {
    if (!detailPartner) return;
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) return alert("Vui lòng nhập số tiền hợp lệ");
    if (amount > detailPartner.debt) return alert("Số tiền trả lớn hơn số nợ hiện tại!");

    if (window.confirm(`Xác nhận thu nợ ${formatCurrency(amount)} của ${detailPartner.name}?`)) {
        try {
            await db.settleDebt(detailPartner.id, amount);
            alert("Đã thanh toán nợ thành công!");
            
            // Refresh data
            loadData();
            // Cập nhật lại view detail ngay lập tức
            const updatedP = db.getPartners().find(p => p.id === detailPartner.id);
            if(updatedP) handleOpenDetail(updatedP);
            else setDetailPartner(null);

        } catch (e: any) {
            alert(e.message);
        }
    }
  };

  // --- Logic Add/Edit ---
  const handleOpenEdit = (e: React.MouseEvent, p?: Partner) => {
    e.stopPropagation();
    if (p) {
      setEditingId(p.id);
      setFormName(p.name);
      setFormPhone(p.phone);
      setFormType(p.type);
      setFormDebt(p.debt.toString());
    } else {
      setEditingId(null);
      setFormName('');
      setFormPhone('');
      setFormType(PartnerType.CUSTOMER);
      setFormDebt('0');
    }
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (!formName) return alert("Vui lòng nhập tên");
    const debt = Number(formDebt);
    if (isNaN(debt) || debt < 0) return alert("Dư nợ không hợp lệ");
    const partner: Partner = {
      id: editingId || `partner-${Date.now()}`,
      name: formName,
      phone: formPhone,
      type: formType,
      debt
    };
    db.savePartner(partner);
    loadData();
    setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
    if(window.confirm("Xóa đối tác này?")) {
      db.deletePartner(id);
      setTimeout(() => { loadData(); setIsModalOpen(false); }, 50);
    }
  }

  return (
    <div className="pb-20">
       <div className="flex justify-between items-center mb-4">
         <h1 className="text-xl font-bold">Đối tác</h1>
         <Button onClick={(e: any) => handleOpenEdit(e)} className="text-sm px-3 py-1">+ Thêm Mới</Button>
       </div>

       <Input
        label="Tìm kiếm đối tác"
        value={searchTerm}
        onChange={(e: any) => setSearchTerm(e.target.value)}
        placeholder="Nhập tên hoặc số điện thoại..."
        className="mb-4"
       />

       <div className="mb-2 text-xs font-bold text-gray-500 uppercase">Lọc theo nợ</div>
       <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar">
         <button onClick={() => setDebtFilter('ALL')} className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${debtFilter === 'ALL' ? 'bg-gray-800 text-white' : 'bg-gray-200 text-gray-700'}`}>Mọi công nợ</button>
         <button onClick={() => setDebtFilter('HAS_DEBT')} className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${debtFilter === 'HAS_DEBT' ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-700'}`}>Có nợ</button>
         <button onClick={() => setDebtFilter('NO_DEBT')} className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${debtFilter === 'NO_DEBT' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700'}`}>Hết nợ</button>
       </div>

       <div className="mb-2 text-xs font-bold text-gray-500 uppercase">Lọc theo tên</div>
       <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar">
         <button onClick={() => setNameFilter('ALL')} className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${nameFilter === 'ALL' ? 'bg-gray-800 text-white' : 'bg-gray-200 text-gray-700'}`}>Mặc định</button>
         <button onClick={() => setNameFilter('A_Z')} className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${nameFilter === 'A_Z' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700'}`}>Tên A → Z</button>
         <button onClick={() => setNameFilter('Z_A')} className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${nameFilter === 'Z_A' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700'}`}>Tên Z → A</button>
       </div>

       {/* Partner List */}
       <div className="space-y-3">
         {partners.map(p => (
           <div key={p.id} onClick={() => handleOpenDetail(p)} className="bg-white p-3 rounded-lg shadow-sm border border-gray-100 flex justify-between items-center active:bg-blue-50 cursor-pointer transition-colors hover:border-blue-200">
             <div>
               <div className="font-bold text-gray-800 flex items-center gap-2">
                 {p.name} 
                 <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide font-bold ${p.type === 'CUSTOMER' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                   {p.type === 'CUSTOMER' ? 'Khách' : 'Trại'}
                 </span>
               </div>
               <div className="text-xs text-gray-500 mt-0.5">{p.phone || 'Chưa có SĐT'}</div>
             </div>
             <div className="flex items-center gap-3">
                <div className="text-right">
                    <div className="text-[10px] text-gray-400 uppercase font-semibold">Dư nợ</div>
                    <div className={`font-bold text-sm ${p.debt > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                        {formatCurrency(p.debt)}
                    </div>
                </div>
                <button onClick={(e) => handleOpenEdit(e, p)} className="p-2 text-gray-400 hover:text-blue-600 bg-gray-50 rounded-full">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                </button>
             </div>
           </div>
         ))}
       </div>

       {/* MODAL 1: Add/Edit Partner */}
       <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? "Sửa Đối Tác" : "Thêm Đối Tác"}>
          <div className="space-y-4">
            <Select 
              label="Loại đối tác" 
              value={formType} 
              onChange={(e: any) => setFormType(e.target.value)} 
              options={[
                {value: PartnerType.CUSTOMER, label: 'Khách hàng'},
                {value: PartnerType.SUPPLIER, label: 'Nhà cung cấp'}
              ]}
            />
            <Input label="Tên" value={formName} onChange={(e: any) => setFormName(e.target.value)} placeholder="Tên khách/trại..." />
            <Input label="Số điện thoại" value={formPhone} onChange={(e: any) => setFormPhone(e.target.value)} type="tel" />
            <Input
              label="Dư nợ hiện tại"
              type="number"
              value={formDebt}
              onChange={(e: any) => setFormDebt(e.target.value)}
              placeholder="0"
            />
            
            <div className="flex gap-2 pt-2">
              {editingId && <Button variant="danger" className="flex-1" onClick={() => handleDelete(editingId)}>Xóa</Button>}
              <Button className="flex-[2]" onClick={handleSave}>Lưu Thông Tin</Button>
            </div>
          </div>
       </Modal>

       {/* MODAL 2: DETAIL & PAY DEBT */}
       {detailPartner && (
         <Modal isOpen={!!detailPartner} onClose={() => setDetailPartner(null)} title="Chi Tiết Nợ">
            <div className="space-y-4">
                {/* Header Info */}
                <div className="bg-gray-50 p-4 rounded-xl text-center border border-gray-100">
                    <h2 className="text-xl font-bold text-gray-800">{detailPartner.name}</h2>
                    <div className="text-sm text-gray-500 mb-2">{detailPartner.phone}</div>
                    
                    <div className="text-xs text-gray-400 uppercase font-bold tracking-widest mt-2">Tổng nợ hiện tại</div>
                    <div className={`text-3xl font-black ${detailPartner.debt > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                        {formatCurrency(detailPartner.debt)}
                    </div>
                </div>

                {/* Danh sách hóa đơn nợ */}
                <div className="max-h-60 overflow-y-auto pr-1 space-y-2">
                    <div className="text-xs font-bold text-gray-500 uppercase mb-2">Các hóa đơn chưa thanh toán</div>
                    {partnerInvoices.length === 0 ? (
                        <div className="text-sm text-center text-gray-400 py-4 italic">Không có hóa đơn nợ nào.</div>
                    ) : (
                        partnerInvoices.map(inv => (
                            <div 
                                key={inv.id} 
                                onClick={() => setViewingInvoice(inv)}
                                className="bg-white border border-orange-100 rounded-lg p-3 shadow-sm flex justify-between items-center cursor-pointer hover:bg-orange-50"
                            >
                                <div>
                                    <div className="font-bold text-sm text-gray-800">{formatDate(inv.date)} <span className="text-gray-400 font-normal text-xs">#{inv.code}</span></div>
                                    <div className="text-xs text-gray-500 mt-1">
                                        Tổng đơn: {formatCurrency(inv.totalAmount)}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-xs text-orange-500 font-semibold">Còn nợ</div>
                                    <div className="font-bold text-orange-600">{formatCurrency(inv.debtAmount)}</div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer Action */}
                <div className="pt-2 border-t border-gray-100">
                    {isPayMode ? (
                        <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                             <div className="bg-green-50 p-2 rounded text-xs text-green-700 mb-2 border border-green-100">
                                Đang thực hiện thu nợ. Hệ thống sẽ tự động trừ vào các hóa đơn cũ nhất.
                             </div>
                             <Input 
                                label="Số tiền khách trả" 
                                type="number" 
                                value={payAmount} 
                                onChange={(e: any) => setPayAmount(e.target.value)} 
                                autoFocus
                                placeholder="Nhập số tiền..."
                             />
                             <div className="flex gap-2">
                                <Button variant="secondary" className="flex-1" onClick={() => setIsPayMode(false)}>Hủy</Button>
                                <Button className="flex-[2] bg-green-600 hover:bg-green-700" onClick={handleSettleDebt}>Xác Nhận Thu</Button>
                             </div>
                        </div>
                    ) : (
                        <Button 
                            className="w-full py-3 bg-orange-600 hover:bg-orange-700 shadow-lg shadow-orange-200" 
                            disabled={detailPartner.debt <= 0}
                            onClick={() => setIsPayMode(true)}
                        >
                            {detailPartner.debt > 0 ? 'THANH TOÁN NỢ' : 'KHÁCH HẾT NỢ'}
                        </Button>
                    )}
                </div>
            </div>
         </Modal>
       )}

       {/* MODAL 3: CHI TIẾT HOÁ ĐƠN */}
       <Modal isOpen={!!viewingInvoice} onClose={() => setViewingInvoice(null)} title="Chi Tiết Hoá Đơn">
           <div className="space-y-4">
           {viewingInvoice && (
               <>
                   <div className="bg-gray-50 p-3 rounded-lg text-center border border-gray-200">
                       <div className="font-bold text-gray-800 text-lg">#{viewingInvoice.code}</div>
                       <div className="text-xs text-gray-500">{new Date(viewingInvoice.date).toLocaleString('vi-VN')}</div>
                       <div className="mt-2 flex justify-center gap-4 text-sm">
                          <div>Tổng: <b>{formatCurrency(viewingInvoice.totalAmount)}</b></div>
                          <div className="text-orange-600">Nợ: <b>{formatCurrency(viewingInvoice.debtAmount)}</b></div>
                       </div>
                   </div>

                   <div className="space-y-2 max-h-80 overflow-y-auto">
                       {viewingInvoice.lines.map((line, idx) => (
                           <div key={idx} className="flex flex-col p-3 border-b last:border-0 border-gray-100 bg-white rounded shadow-sm">
                               <div className="flex justify-between w-full mb-1">
                                   <div className="font-bold text-gray-800">{line.productName}</div>
                                   <div className="font-bold text-blue-600">{formatCurrency(line.amount)}</div>
                               </div>
                               <div className="flex justify-between text-xs text-gray-500">
                                   <span>{line.qtyKg} kg | {line.qtyCon} con {line.gender === 'FEMALE' ? '(Mái)' : '(Trống)'}</span>
                                   <span>Giá: {formatCurrency(line.price)}</span>
                               </div>
                           </div>
                       ))}
                   </div>
                   <Button className="w-full" onClick={() => setViewingInvoice(null)}>Đóng</Button>
               </>
           )}
           </div>
       </Modal>
    </div>
  )
}

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [page, setPage] = useState('dashboard');
  
  // State dummy để ép render lại toàn bộ App khi DB thay đổi
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  useEffect(() => {
    // Lắng nghe sự thay đổi từ db (Realtime sync)
    db.subscribe(() => {
      console.log("App received update signal, re-rendering...");
      setLastUpdate(Date.now());
    });

    const savedId = localStorage.getItem('gttd_current_business_id');
    if (savedId) {
      // Nếu đã từng đăng nhập, init lại để kết nối Realtime
      db.init(savedId).then(() => {
        setIsLoggedIn(true);
      });
    }
  }, []);

  // 👇 1. THÊM HÀM ĐĂNG XUẤT NÀY VÀO
  const handleLogout = () => {
    if (window.confirm("Bạn muốn đổi sang tài khoản doanh nghiệp khác?")) {
      localStorage.removeItem('gttd_current_business_id'); // Xóa mã cũ
      window.location.reload(); // Tải lại trang để về màn hình đăng nhập
    }
  };

  const renderPage = () => {
    switch (page) {
      // 👇 2. SỬA DÒNG NÀY (Truyền thêm onLogout)
      case 'dashboard': return <Dashboard navigate={setPage} onLogout={handleLogout} />;
      
      case 'pos': return <POS navigate={setPage} />;
      case 'inventory': return <Inventory key={lastUpdate} />;
      case 'import': return <ImportPage navigate={setPage} />;
      case 'cash': return <CashbookPage />;
      case 'partners': return <PartnersPage />;
      // 👇 3. SỬA CẢ DÒNG DEFAULT NÀY NỮA
      default: return <Dashboard navigate={setPage} onLogout={handleLogout} />;
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