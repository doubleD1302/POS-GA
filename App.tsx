import React, { useState, useEffect, useRef } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import Dashboard from './pages/Dashboard';
import POS from './pages/POS';
import Inventory from './pages/Inventory';
import { ICONS, formatCurrency, formatDate} from './constants';
import { db } from './services/db';
import { Button, Input, Select, Card, Modal } from './components/ui';
import { Partner, PartnerType, BankSettings, Invoice, CashTransaction, PreOrder, PaymentMethod, Product, Gender, SupplierCategory, Unit, DeletedTransactionHistory } from './types';

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
        <div className="surface-elevated rounded-2xl p-6 w-full max-w-sm">
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
      
      <div className="surface-elevated rounded-2xl p-6 w-full max-w-sm">
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

  const [ticketItems, setTicketItems] = useState<{
      pid: string;
      pName: string;
      gender: Gender;
      rawKg: number;
      debtDeductKg: number;
      kg: number;
      con: number;
      price: number;
      total: number;
      gross: number;
      tare: number;
      details: string;
  }[]>([]);

  const [currentPid, setCurrentPid] = useState('');
  const [tareMode, setTareMode] = useState<'BY_CAGE' | 'BY_WEIGHT'>('BY_CAGE');
  const [currentWeightInput, setCurrentWeightInput] = useState('');
  const [currentTareInput, setCurrentTareInput] = useState('');
  const [currentCageInput, setCurrentCageInput] = useState('');
  const [currentCountInput, setCurrentCountInput] = useState('');
  const [priceMale, setPriceMale] = useState('');
  const [priceFemale, setPriceFemale] = useState('');
  const [lastTicketKey, setLastTicketKey] = useState<string | null>(null);

  const [isSupModalOpen, setIsSupModalOpen] = useState(false);
  const [newSupName, setNewSupName] = useState('');
  const [newSupPhone, setNewSupPhone] = useState('');
  const [newSupCategory, setNewSupCategory] = useState<SupplierCategory>('FARM');
  const [isProdModalOpen, setIsProdModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [prodName, setProdName] = useState('');
  const [prodPrice, setProdPrice] = useState('');

  const weightInputRef = useRef<HTMLInputElement>(null);
  const [gender, setGender] = useState<Gender>('MALE');

  const loadSuppliers = () => {
    const list = db.getPartners(PartnerType.SUPPLIER);
    setSuppliers(list);
    return list;
  };

  const loadProducts = () => {
    const list = db.getProducts();
    setProducts(list);
    return list;
  };

  const saveLastDefaults = (override?: Partial<{ supplierId: string; productId: string; gender: Gender; priceMale: string; priceFemale: string; tareMode: 'BY_CAGE' | 'BY_WEIGHT' }>) => {
    const payload = {
      supplierId,
      productId: currentPid,
      gender,
      priceMale,
      priceFemale,
      tareMode,
      ...override,
    };
    localStorage.setItem('gttd_import_defaults', JSON.stringify(payload));
  };

  useEffect(() => {
    const prodList = loadProducts();
    const supList = loadSuppliers();

    const rawDefaults = localStorage.getItem('gttd_import_defaults');
    if (rawDefaults) {
      try {
        const defaults = JSON.parse(rawDefaults);
        if (defaults.gender === 'MALE' || defaults.gender === 'FEMALE') setGender(defaults.gender);
        if (typeof defaults.priceMale === 'string') setPriceMale(defaults.priceMale);
        if (typeof defaults.priceFemale === 'string') setPriceFemale(defaults.priceFemale);
        if (defaults.tareMode === 'BY_CAGE' || defaults.tareMode === 'BY_WEIGHT') setTareMode(defaults.tareMode);
        if (defaults.productId && prodList.some(p => p.id === defaults.productId)) setCurrentPid(defaults.productId);
        if (defaults.supplierId && supList.some(s => s.id === defaults.supplierId)) {
          setSupplierId(defaults.supplierId);
        } else if (supList.length > 0) {
          setSupplierId(supList[0].id);
        }
      } catch {
        if (supList.length > 0) setSupplierId(supList[0].id);
      }
    } else if (supList.length > 0) {
      setSupplierId(supList[0].id);
    }
  }, []);

  useEffect(() => {
    if (supplierId || currentPid) saveLastDefaults();
  }, [supplierId, currentPid, gender, priceMale, priceFemale, tareMode]);

  useEffect(() => {
    const supplier = suppliers.find(s => s.id === supplierId);
    if (!supplier) return;
    const category = supplier.supplierCategory || 'FARM';
    setTareMode(category === 'COMPANY' ? 'BY_WEIGHT' : 'BY_CAGE');
  }, [supplierId, suppliers]);

  const detailGrossWeight = parseFloat(currentWeightInput) || 0;
  const detailTareByWeight = parseFloat(currentTareInput) || 0;
  const detailCageCount = parseInt(currentCageInput) || 0;
  const detailTareByCage = detailCageCount * 5;
  const detailTare = tareMode === 'BY_CAGE' ? detailTareByCage : detailTareByWeight;
  const detailCon = parseInt(currentCountInput) || 0;
  const detailNetWeight = detailGrossWeight - detailTare;

  const handleAddItemToTicket = () => {
    if (!currentPid) return alert("Chưa chọn loại gà!");

    const actualPriceByThousand = gender === 'MALE' ? priceMale : priceFemale;
    if (!actualPriceByThousand) return alert("Chưa nhập giá nhập!");
    const priceNum = (parseFloat(actualPriceByThousand) || 0) * 1000;
    if (priceNum <= 0) return alert("Giá nhập không hợp lệ!");

    let itemKg = 0;
    let itemCon = 0;
    let itemGross = 0;
    let itemTare = 0;
    let detailsStr = '';
    const keyWithoutPrice = `${currentPid}|${gender}`;

    if (tareMode === 'BY_CAGE') {
      if (detailGrossWeight <= 0) {
        alert("Vui lòng nhập khối lượng (kg)!");
        weightInputRef.current?.focus();
        return;
      }
      if (detailNetWeight <= 0) return alert("Khối lượng thực bằng 0 hoặc âm!");

      itemKg = detailNetWeight;
      itemCon = detailCon;
      itemGross = detailGrossWeight;
      itemTare = detailTareByCage;
      detailsStr = `${detailGrossWeight}${itemTare > 0 ? `(-${itemTare}b/${detailCageCount} lồng)` : ''}`;
    } else {
      if (detailGrossWeight <= 0 && detailTareByWeight <= 0 && detailCon <= 0) {
        return alert("Nhập ít nhất một giá trị (kg, bì hoặc con)");
      }

      const lastItem = ticketItems[ticketItems.length - 1];
      const isSameAsLastGroup = !!lastItem && lastItem.pid === currentPid && lastItem.gender === gender;

      if (detailGrossWeight <= 0 && detailTareByWeight > 0) {
        if (!isSameAsLastGroup) {
          return alert("Nhập chỉ bì chỉ áp dụng cho dòng vừa nhập cùng loại gà và giới tính.");
        }
        if (lastItem.kg - detailTareByWeight < 0) {
          return alert("Khối lượng bì vượt quá khối lượng thực của dòng hiện tại.");
        }
      }

      if (detailGrossWeight > 0 && detailNetWeight <= 0) {
        return alert("Khối lượng thực bằng 0 hoặc âm!");
      }

      itemKg = detailGrossWeight - detailTareByWeight;
      itemCon = detailCon;
      itemGross = detailGrossWeight;
      itemTare = detailTareByWeight;
      detailsStr = detailGrossWeight > 0
        ? `${detailGrossWeight}${itemTare > 0 ? `(-${itemTare}b)` : ''}`
        : `Trừ bì ${itemTare}kg`;
    }

    const prod = products.find(p => p.id === currentPid);
    const debtDeductKg = itemKg > 0 ? itemKg * 0.02 : 0;
    const finalImportedKg = itemKg - debtDeductKg;

    const newItem = {
      pid: currentPid,
      pName: `${prod ? prod.name : 'Unknown'} (${gender === 'MALE' ? 'Trống' : 'Mái'})`,
      gender,
      rawKg: itemKg,
      debtDeductKg,
      kg: finalImportedKg,
      con: itemCon,
      price: priceNum,
      total: finalImportedKg * priceNum,
      gross: itemGross,
      tare: itemTare,
      details: `${detailsStr} | trừ no 2%: -${debtDeductKg.toFixed(2)}kg | nhập kho: ${finalImportedKg.toFixed(2)}kg`,
    };

    const newItemKey = `${keyWithoutPrice}|${priceNum}`;
    const lastItem = ticketItems[ticketItems.length - 1];
    const canMergeLast = !!lastItem && `${lastItem.pid}|${lastItem.gender}|${lastItem.price}` === newItemKey && lastTicketKey === newItemKey;

    if (canMergeLast) {
      const updatedItems = [...ticketItems];
      const existing = updatedItems[updatedItems.length - 1];
      const mergedKg = existing.kg + newItem.kg;
      if (mergedKg < 0) return alert("Dòng sau khi trừ bì bị âm kg, vui lòng kiểm tra lại.");

      updatedItems[updatedItems.length - 1] = {
        ...existing,
        rawKg: existing.rawKg + newItem.rawKg,
        debtDeductKg: existing.debtDeductKg + newItem.debtDeductKg,
        kg: mergedKg,
        con: existing.con + newItem.con,
        total: existing.total + newItem.total,
        gross: existing.gross + newItem.gross,
        tare: existing.tare + newItem.tare,
        details: `${existing.details} + ${newItem.details}`,
      };
      setTicketItems(updatedItems);
    } else {
      if (newItem.kg < 0) {
        return alert("Không thể tạo dòng mới chỉ với bì âm kg. Hãy nhập thêm khối lượng hoặc trừ bì trên dòng vừa nhập.");
      }
      setTicketItems([...ticketItems, newItem]);
    }
    setLastTicketKey(newItemKey);

    setCurrentWeightInput('');
    setCurrentTareInput('');
    setCurrentCageInput('');
    setCurrentCountInput('');
    saveLastDefaults();
    weightInputRef.current?.focus();
  };

  const handleRemoveTicketItem = (idx: number) => {
    const next = [...ticketItems];
    next.splice(idx, 1);
    setTicketItems(next);
    if (next.length === 0) setLastTicketKey(null);
  };

  const handleImport = async () => {
    if (ticketItems.length === 0) return alert('Chưa có hàng hoá nào');
    if (!supplierId) return alert('Chọn nhà cung cấp');

    await db.createPurchase(
      supplierId,
      new Date().toISOString().split('T')[0],
      ticketItems.map(i => ({
        productId: i.pid,
        qtyKg: i.kg,
        qtyCon: i.con,
        price: i.price,
        gender: i.gender,
        gross: i.gross,
        tare: i.tare,
        details: i.details,
      })),
      0,
      0
    );
    alert('Đã lưu phiếu nhập mua!');
    navigate('inventory');
  };

  const handleAddSupplier = () => {
    if (!newSupName) return;
    const newSup: Partner = {
      id: `s-${Date.now()}`,
      name: newSupName,
      phone: newSupPhone,
      type: PartnerType.SUPPLIER,
      supplierCategory: newSupCategory,
      debt: 0
    };
    db.savePartner(newSup);
    const list = loadSuppliers();
    setSupplierId(newSup.id);
    setIsSupModalOpen(false);
    setNewSupName('');
    setNewSupPhone('');
    setNewSupCategory('FARM');
    if (list.length > 0) saveLastDefaults({ supplierId: newSup.id });
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
  };

  const handleOpenProdModal = (pid?: string) => {
    if (pid) {
      const p = products.find(x => x.id === pid);
      if (p) {
        setEditingProduct(p);
        setProdName(p.name);
        setProdPrice(p.priceMale ? (p.priceMale / 1000).toString() : '');
      }
    } else {
      setEditingProduct(null);
      setProdName('');
      setProdPrice('');
    }
    setIsProdModalOpen(true);
  };

  const handleSaveProduct = () => {
    if (!prodName) return;

    const newProduct: Product = {
      id: editingProduct ? editingProduct.id : `p-${Date.now()}`,
      name: prodName,
      priceMale: (Number(prodPrice) || 0) * 1000,
      priceFemale: editingProduct?.priceFemale || 0,
      costMale: editingProduct?.costMale || 0,
      costFemale: editingProduct?.costFemale || 0,
    };

    db.saveProduct(newProduct);
    const nextProducts = loadProducts();
    if (!editingProduct && nextProducts.some(p => p.id === newProduct.id)) setCurrentPid(newProduct.id);
    setIsProdModalOpen(false);
  };

  const currentSupplier = suppliers.find(s => s.id === supplierId);
  const getDetailLines = (details: string) => {
    return (details || '')
      .split(' + ')
      .map(part => part.trim())
      .filter(Boolean);
  };

  return (
    <div className="pb-24">
      <h1 className="text-xl font-bold mb-4 flex items-center gap-2 text-brand-900">
        <ICONS.Inventory /> Nhập Hàng
      </h1>

      <Card className="mb-4 bg-blue-50 border-blue-100">
        <div className="flex justify-between items-center mb-1">
          <label className="text-xs font-bold text-blue-800 uppercase">Nhà Cung Cấp</label>
          {supplierId && <button onClick={handleDeleteSupplier} className="text-red-400 text-xs">Xoá</button>}
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-full px-3 py-3 surface-elevated border border-blue-200 rounded-lg text-gray-800 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500">
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.supplierCategory === 'COMPANY' ? 'Công ty' : 'Trại'})</option>)}
            </select>
          </div>
          <button onClick={() => setIsSupModalOpen(true)} className="px-4 bg-blue-600 text-white rounded-lg font-bold shadow-sm">+</button>
        </div>
        <div className="text-[11px] text-blue-700 mt-2">
          Mặc định kiểu tính bì: {(suppliers.find(s => s.id === supplierId)?.supplierCategory || 'FARM') === 'COMPANY' ? 'Theo khối lượng bì thực tế' : 'Theo số lồng (1 lồng = 5kg)'}
        </div>
      </Card>

      <Card className="mb-6 border-brand-200 shadow-md">
        <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
          <h3 className="font-bold text-brand-800 flex items-center gap-2"><span>Nhập hàng</span></h3>
          <div className="flex bg-gray-100 rounded-lg p-1 border border-gray-200">
            <button
              onClick={() => setTareMode('BY_CAGE')}
              className={`px-3 py-1 rounded text-xs font-bold transition-all ${tareMode === 'BY_CAGE' ? 'bg-brand-600 text-white shadow' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Theo lồng
            </button>
            <button
              onClick={() => setTareMode('BY_WEIGHT')}
              className={`px-3 py-1 rounded text-xs font-bold transition-all ${tareMode === 'BY_WEIGHT' ? 'bg-brand-600 text-white shadow' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Bì thực tế
            </button>
          </div>
        </div>

        <div className="flex gap-2 mb-3">
          <div className="flex-[2]">
            <select className="w-full px-3 py-2 surface-elevated border border-gray-300 rounded-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500" value={currentPid} onChange={e => setCurrentPid(e.target.value)}>
              <option value="">-- Chọn Loại Gà --</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
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

        <>
          <div className="flex gap-2 mb-3 items-end">
            <div className="flex-[2]">
              <label className="text-[10px] text-gray-500 font-bold ml-1">KHỐI LƯỢNG (KG)</label>
              <input ref={weightInputRef} type="number" placeholder="0.0" className="w-full px-2 py-2 text-lg font-bold text-gray-800 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none" value={currentWeightInput} onChange={e => setCurrentWeightInput(e.target.value)} />
            </div>
            {tareMode === 'BY_CAGE' ? (
              <div className="flex-1">
                <label className="text-[10px] text-red-500 font-bold ml-1">SL LỒNG</label>
                <input type="number" placeholder="0" className="w-full px-2 py-2 text-lg font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:outline-none" value={currentCageInput} onChange={e => setCurrentCageInput(e.target.value)} />
              </div>
            ) : (
              <div className="flex-1">
                <label className="text-[10px] text-red-500 font-bold ml-1">BÌ (KG)</label>
                <input type="number" placeholder="0" className="w-full px-2 py-2 text-lg font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:outline-none" value={currentTareInput} onChange={e => setCurrentTareInput(e.target.value)} />
              </div>
            )}
            <div className="flex-1">
              <label className="text-[10px] text-gray-500 font-bold ml-1">CON</label>
              <input type="number" placeholder="0" className="w-full px-2 py-2 text-lg font-bold text-center text-gray-800 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none" value={currentCountInput} onChange={e => setCurrentCountInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAddItemToTicket(); }} />
            </div>
          </div>

          <div className="text-[11px] text-gray-500 mb-2">
            {tareMode === 'BY_CAGE'
              ? 'Bì tự tính = Số lồng × 5kg'
              : 'Cho phép chỉ nhập Bì (kg) để trừ riêng sau khi cân xong.'}
          </div>

          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">Tổng cân (Gross):</span>
              <span className="font-bold text-gray-800">{detailGrossWeight.toFixed(2)} kg</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">Tổng trừ bì:</span>
              <span className="font-bold text-red-500">-{detailTare.toFixed(2)} kg</span>
            </div>
            <div className="border-t border-gray-300 pt-2 flex justify-between items-center">
              <span className="font-bold text-brand-700 text-lg">Net thay đổi:</span>
              <span className={`text-2xl font-bold ${detailNetWeight >= 0 ? 'text-brand-600' : 'text-red-600'}`}>{detailNetWeight.toFixed(2)} kg</span>
            </div>
          </div>
        </>

        <div className="grid grid-cols-2 gap-3 mt-4">
          <Input label="Giá nhập (nghìn VND/kg)" type="number" value={gender === 'MALE' ? priceMale : priceFemale} onChange={(e: any) => gender === 'MALE' ? setPriceMale(e.target.value) : setPriceFemale(e.target.value)} className="font-bold" placeholder="0" />
          <div className="flex flex-col">
            <label className="text-sm font-bold text-gray-700 mb-1">Số con</label>
            <div className="w-full px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-gray-800 font-bold">
              {detailCon}
            </div>
          </div>
        </div>

        <div className="mt-4 pt-2 border-t border-dashed border-gray-200">
          <Button onClick={handleAddItemToTicket} className="w-full py-3 text-lg">⬇ Thêm Vào Phiếu</Button>
        </div>
      </Card>

      {ticketItems.length > 0 && (
        <div className="surface-elevated rounded-none border border-gray-300 overflow-hidden mb-20 relative">
          <div className="surface-card p-4 text-center border-b border-gray-300 border-dashed">
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
                  <div>Tổng cân: <span className="font-bold text-gray-800">{item.gross.toFixed(2)} kg</span></div>
                  <div>Trừ bì: <span className="font-bold text-red-600">-{item.tare.toFixed(2)} kg</span></div>
                  <div className="col-span-2 border-b border-gray-100 my-1"></div>
                  <div>Thực nhập (sau bì): <span className="font-bold text-blue-600">{item.rawKg.toFixed(2)} kg</span></div>
                  <div>Trừ no 2%: <span className="font-bold text-red-600">-{item.debtDeductKg.toFixed(2)} kg</span></div>
                  <div className="col-span-2">Thực nhập kho: <span className="font-bold text-emerald-600">{item.kg.toFixed(2)} kg</span></div>
                  <div>Số lượng: <span className="font-bold text-blue-600">{item.con} con</span></div>
                  <div className="col-span-2 mt-2 bg-slate-50 border border-slate-200 rounded p-2">
                    <div className="text-[11px] font-bold text-slate-600 mb-1">Chi tiết mã gà:</div>
                    <ol className="list-decimal pl-4 space-y-1 text-xs text-slate-700">
                      {getDetailLines(item.details).map((line, lineIdx) => (
                        <li key={lineIdx} className="leading-5 break-words">{line}</li>
                      ))}
                    </ol>
                  </div>
                  <div className="col-span-2 border-t border-gray-200 mt-2 pt-2 flex justify-between items-center">
                    <span>Đơn giá: {(item.price / 1000).toLocaleString('vi-VN')} nghìn VND/kg</span>
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
              <span className="text-gray-300">Tổng thực nhập (sau bì):</span>
              <span>{ticketItems.reduce((a, b) => a + b.rawKg, 0).toFixed(2)} kg</span>
            </div>
            <div className="flex justify-between items-center text-sm mb-3">
              <span className="text-gray-300">Tổng trừ no 2%:</span>
              <span>-{ticketItems.reduce((a, b) => a + b.debtDeductKg, 0).toFixed(2)} kg</span>
            </div>
            <div className="flex justify-between items-center text-sm mb-3">
              <span className="text-gray-300">Tổng nhập kho:</span>
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

      <Modal isOpen={isSupModalOpen} onClose={() => setIsSupModalOpen(false)} title="Thêm Nhà Cung Cấp">
        <div className="space-y-4">
          <Input label="Tên trại/người bán" value={newSupName} onChange={(e:any) => setNewSupName(e.target.value)} />
          <Input label="Số điện thoại" value={newSupPhone} onChange={(e:any) => setNewSupPhone(e.target.value)} />
          <div>
            <label className="text-sm font-bold text-gray-700 mb-1 block">Loại nhà cung cấp</label>
            <div className="flex gap-2">
              <button onClick={() => setNewSupCategory('FARM')} className={`flex-1 py-2 rounded-lg border text-sm font-bold ${newSupCategory === 'FARM' ? 'bg-blue-600 text-white border-blue-600' : 'surface-card text-gray-700 border-gray-300'}`}>Trại</button>
              <button onClick={() => setNewSupCategory('COMPANY')} className={`flex-1 py-2 rounded-lg border text-sm font-bold ${newSupCategory === 'COMPANY' ? 'bg-indigo-600 text-white border-indigo-600' : 'surface-card text-gray-700 border-gray-300'}`}>Công ty</button>
            </div>
          </div>
          <Button className="w-full" onClick={handleAddSupplier}>Lưu</Button>
        </div>
      </Modal>

      <Modal isOpen={isProdModalOpen} onClose={() => setIsProdModalOpen(false)} title={editingProduct ? "Sửa Loại Gà" : "Thêm Loại Gà"}>
        <div className="space-y-4">
          <Input label="Tên loại gà" value={prodName} onChange={(e:any) => setProdName(e.target.value)} placeholder="VD: Gà Ri..." />
          <Input label="Giá bán mặc định (nghìn VND/kg)" value={prodPrice} onChange={(e:any) => setProdPrice(e.target.value)} type="number" />
          <Button className="w-full" onClick={handleSaveProduct}>Lưu Thông Tin</Button>
        </div>
      </Modal>
    </div>
  );
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
  const [deletedTxns, setDeletedTxns] = useState<DeletedTransactionHistory[]>([]);
  const [historyView, setHistoryView] = useState<'ACTIVE' | 'DELETED'>('ACTIVE');
  
  // Detail Modal & Settings Modal & PreOrder (Giữ nguyên logic cũ)
  const [selectedTxn, setSelectedTxn] = useState<CashTransaction | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | undefined>(undefined);
  const [isEditInvoiceMode, setIsEditInvoiceMode] = useState(false);
  const [editCart, setEditCart] = useState<Array<{
    productId: string;
    productName: string;
    gender: Gender;
    qtyKg: number;
    qtyCon: number;
    price: number;
    amount: number;
    unit: Unit;
    isManual?: boolean;
  }>>([]);
  const [editPaymentMethod, setEditPaymentMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [editLaborFee, setEditLaborFee] = useState(0);
  const [editSaleGender, setEditSaleGender] = useState<Gender>('MALE');
  const [editActiveProductId, setEditActiveProductId] = useState('');
  const [editIsManualItem, setEditIsManualItem] = useState(false);
  const [editManualName, setEditManualName] = useState('');
  const [editQtyKg, setEditQtyKg] = useState('');
  const [editQtyCon, setEditQtyCon] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editUseManualPrice, setEditUseManualPrice] = useState(false);
  const [editReason, setEditReason] = useState('');
  const [isSavingInvoiceEdit, setIsSavingInvoiceEdit] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingStep, setSettingStep] = useState<'INPUT' | 'CONFIRM'>('INPUT');
  const [bankId, setBankId] = useState('');
  const [accNo, setAccNo] = useState('');
  const [accName, setAccName] = useState('');
  const [lookupName, setLookupName] = useState('');
  const [preOrders, setPreOrders] = useState<PreOrder[]>([]);
  const [orderView, setOrderView] = useState<'PENDING' | 'PREPARED'>('PENDING');
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<PreOrder | null>(null);
  
  // State form PreOrder
  const [poName, setPoName] = useState('');
  const [poPhone, setPoPhone] = useState('');
  const [poProduct, setPoProduct] = useState('');
  const [poCon, setPoCon] = useState('');
  const [poKg, setPoKg] = useState('');
  const [poPrice, setPoPrice] = useState('');
  const [poTime, setPoTime] = useState('');
  const [poNote, setPoNote] = useState('');
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  const [isSummaryUnlocked, setIsSummaryUnlocked] = useState(false);

  const customerOptions = db.getPartners(PartnerType.CUSTOMER);
  const quickCustomerOptions = db.getQuickCustomers();
  const productOptions = db.getProducts();
  const manualGoodsOptions = Array.from(new Set([
    ...invoices
      .flatMap(inv => inv.lines || [])
      .filter(line => line.productId === 'MANUAL' && !!line.productName)
      .map(line => line.productName.trim())
      .filter(Boolean),
    ...db.getQuickItems()
  ]));

  const reloadPreOrders = () => {
    setPreOrders(db.getPreOrders().filter(o => o.status !== 'DONE'));
  };

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
    
    reloadPreOrders();
    setDeletedTxns(db.getDeletedTransactionHistories(200));

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

  const handleSummarySecurityToggle = () => {
    if (isSummaryUnlocked) {
      setIsSummaryUnlocked(false);
      setIsSummaryExpanded(false);
      return;
    }

    const currentCode = localStorage.getItem('gttd_current_business_id');
    const inputCode = window.prompt('🔒 Nhập Mã Doanh Nghiệp để mở bảng chỉ số Sổ quỹ:');

    if (inputCode === currentCode) {
      setIsSummaryUnlocked(true);
      setIsSummaryExpanded(true);
      return;
    }

    if (inputCode !== null) {
      alert('❌ Mã không đúng. Không thể hiển thị chỉ số.');
    }
  };

  const handleSummaryMenuClick = () => {
    if (!isSummaryUnlocked) {
      handleSummarySecurityToggle();
      return;
    }
    setIsSummaryExpanded(prev => !prev);
  };

  // --- REPORT GENERATION ---
  const ReportModal = () => {
    if (!isReportOpen) return null;
    
    // Tìm top chi phí
    const expenses = filteredTxns.filter(t => t.type === 'EXPENSE');
    // Gom nhóm chi phí theo mô tả (đơn giản)
    
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 px-4">
         <div className="surface-elevated rounded-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
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
    setIsEditInvoiceMode(false);
    setEditReason('');
    setEditCart([]);
    if (txn.refId) setSelectedInvoice(db.getInvoice(txn.refId));
    else setSelectedInvoice(undefined);
  }
  const handleCloseTxnModal = () => {
    setSelectedTxn(null);
    setSelectedInvoice(undefined);
    setIsEditInvoiceMode(false);
    setEditReason('');
    setEditCart([]);
    setEditLaborFee(0);
    setEditActiveProductId('');
    setEditManualName('');
    setEditQtyKg('');
    setEditQtyCon('');
    setEditPrice('');
  }

  const getEditProductById = (productId: string) => productOptions.find(p => p.id === productId);

  const openEditProductPicker = (productId: string) => {
    if (productId === 'MANUAL') {
      setEditIsManualItem(true);
      setEditActiveProductId('MANUAL');
      setEditManualName('');
      setEditPrice('');
      setEditQtyKg('');
      setEditQtyCon('');
      setEditUseManualPrice(true);
      return;
    }

    const product = getEditProductById(productId);
    if (!product) return;
    setEditIsManualItem(false);
    setEditActiveProductId(product.id);
    setEditQtyKg('');
    setEditQtyCon('');
    setEditUseManualPrice(false);
    const defaultPrice = editSaleGender === 'MALE' ? product.priceMale : product.priceFemale;
    setEditPrice(((defaultPrice || 0) / 1000).toString());
  }

  const handleAddEditCartItem = () => {
    if (!editActiveProductId) return alert('Vui lòng chọn sản phẩm cần thêm.');

    const qtyKg = Number(editQtyKg) || 0;
    const qtyCon = Number(editQtyCon) || 0;
    if (qtyKg <= 0 && qtyCon <= 0) return alert('Nhập số kg hoặc số con.');

    const priceVnd = (Number(editPrice) || 0) * 1000;
    if (priceVnd <= 0) return alert('Đơn giá không hợp lệ.');

    if (editIsManualItem && !editManualName.trim()) {
      return alert('Vui lòng nhập tên hàng ngoài.');
    }

    let productName = '';
    if (editIsManualItem) {
      productName = editManualName.trim();
      db.saveQuickItem(productName);
    } else {
      const prod = getEditProductById(editActiveProductId);
      if (!prod) return alert('Không tìm thấy sản phẩm đã chọn.');
      productName = prod.name;
    }

    const amount = (qtyKg > 0 ? qtyKg : qtyCon) * priceVnd;
    const newItem = {
      productId: editIsManualItem ? 'MANUAL' : editActiveProductId,
      productName,
      gender: editSaleGender,
      qtyKg,
      qtyCon,
      price: priceVnd,
      amount,
      unit: qtyKg > 0 ? Unit.KG : Unit.CON,
      isManual: editIsManualItem,
    };

    setEditCart(prev => [...prev, newItem]);
    setEditQtyKg('');
    setEditQtyCon('');
    if (editIsManualItem) {
      setEditManualName('');
      setEditPrice('');
    }
  }

  const handleRemoveEditCartItem = (index: number) => {
    setEditCart(prev => prev.filter((_, idx) => idx !== index));
  }

  const handleOpenEditInvoice = () => {
    if (!selectedInvoice || selectedInvoice.type !== 'EXPORT') return;

    const currentLines = selectedInvoice.lines || [];
    const laborLine = currentLines.find(line => line.productId === 'MANUAL' && (line.productName === 'Tiền công' || line.productName === 'Giảm trừ') && (Number(line.qtyKg) || 0) === 0 && (Number(line.qtyCon) || 0) === 1);

    const cartLines = currentLines
      .filter(line => line !== laborLine)
      .map(line => {
        const qtyKg = Number(line.qtyKg) || 0;
        const qtyCon = Number(line.qtyCon) || 0;
        const price = Number(line.price) || 0;
        return {
          productId: line.productId,
          productName: line.productName,
          gender: line.gender || 'MALE',
          qtyKg,
          qtyCon,
          price,
          amount: (qtyKg > 0 ? qtyKg : qtyCon) * price,
          unit: qtyKg > 0 ? Unit.KG : Unit.CON,
          isManual: line.productId === 'MANUAL',
        };
      });

    setEditCart(cartLines);
    setEditLaborFee(Number(laborLine?.price) || 0);
    setEditPaymentMethod(selectedInvoice.paymentMethod || (selectedInvoice.debtAmount > 0 ? PaymentMethod.DEBT : PaymentMethod.CASH));
    setEditSaleGender('MALE');
    setEditActiveProductId('');
    setEditIsManualItem(false);
    setEditManualName('');
    setEditQtyKg('');
    setEditQtyCon('');
    setEditPrice('');
    setEditUseManualPrice(false);
    setEditReason('');
    setIsEditInvoiceMode(true);
  }
  const editableGoodsTotal = editCart.reduce((sum, line) => sum + ((line.qtyKg > 0 ? line.qtyKg : line.qtyCon) * line.price), 0);
  const editablePreviewTotal = editableGoodsTotal + (Number(editLaborFee) || 0);
  const handleSaveEditedInvoice = async () => {
    if (!selectedInvoice || selectedInvoice.type !== 'EXPORT') return;
    if (!editReason.trim()) {
      alert('Vui lòng nhập lý do chỉnh sửa.');
      return;
    }
    if (editCart.length === 0 && Number(editLaborFee) === 0) {
      alert('Hoá đơn phải có ít nhất một dòng hàng.');
      return;
    }

    const updatedLines = editCart.map(line => ({
      productId: line.productId,
      productName: line.productName,
      gender: line.gender,
      qtyKg: line.qtyKg,
      qtyCon: line.qtyCon,
      price: line.price,
    }));

    if (Number(editLaborFee) !== 0) {
      updatedLines.push({
        productId: 'MANUAL',
        productName: Number(editLaborFee) > 0 ? 'Tiền công' : 'Giảm trừ',
        gender: 'MALE',
        qtyKg: 0,
        qtyCon: 1,
        price: Number(editLaborFee),
      });
    }

    const hasInvalidLine = updatedLines.some(line => {
      if (line.qtyKg <= 0 && line.qtyCon <= 0) return true;
      if (line.price === 0) return true;
      if (line.price < 0 && line.productId !== 'MANUAL') return true;
      return false;
    });
    if (hasInvalidLine) {
      alert('Mỗi dòng cần có số lượng và đơn giá hợp lệ.');
      return;
    }

    setIsSavingInvoiceEdit(true);
    try {
      const updated = await db.updateExportInvoice(
        selectedInvoice.id,
        updatedLines,
        editReason.trim(),
        {
          paymentMethod: editPaymentMethod,
          paidAmount: editPaymentMethod === PaymentMethod.DEBT ? 0 : Math.max(0, editablePreviewTotal),
        }
      );
      setSelectedInvoice(updated);
      setInvoices(db.getInvoices());
      setTxns(db.getCashTransactions());
      if (selectedTxn && selectedTxn.refId === updated.id) {
        if (selectedTxn.type === 'DEBT') {
          setSelectedTxn({
            ...selectedTxn,
            amount: updated.debtAmount,
            description: `Ghi nợ: ${updated.partnerName} (${updated.code})`,
          } as any);
        } else if (selectedTxn.type === 'INCOME') {
          setSelectedTxn({ ...selectedTxn, amount: updated.paidAmount } as any);
        }
      }
      setIsEditInvoiceMode(false);
      setEditReason('');
      setEditCart([]);
      alert('Đã cập nhật giao dịch thành công.');
    } catch (e: any) {
      alert(e.message || 'Không thể lưu chỉnh sửa giao dịch.');
    } finally {
      setIsSavingInvoiceEdit(false);
    }
  }
  // PreOrder Logic (Giữ nguyên)
  const handleOpenOrderModal = (order?: PreOrder) => {
    if (order) {
      setSelectedOrder(order); setPoName(order.customerName); setPoPhone(order.phone || '');
      setPoProduct(order.productNote); setPoCon(order.qtyCon?.toString() || ''); setPoKg(order.qtyKg?.toString() || '');
      setPoPrice(order.unitPrice ? String((order.unitPrice || 0) / 1000) : '');
      setPoTime(order.deliveryTime); setPoNote(order.note || '');
    } else {
      setSelectedOrder(null); setPoName(''); setPoPhone(''); setPoProduct(''); setPoCon(''); setPoKg('');
      setPoPrice('');
      const now = new Date(); now.setHours(now.getHours() + 1); now.setMinutes(0); setPoTime(now.toISOString().slice(0, 16)); setPoNote('');
    }
    setIsOrderModalOpen(true);
  }
  const handleSaveOrder = () => {
    if (!poName || !poTime) return alert("Cần nhập tên khách và giờ hẹn");
    db.saveQuickCustomer(poName, poPhone);
    db.saveQuickItem(poProduct);
    const order: PreOrder = {
      id: selectedOrder ? selectedOrder.id : `po-${Date.now()}`, customerName: poName, phone: poPhone,
      productNote: poProduct,
      qtyCon: Number(poCon) || 0,
      qtyKg: Number(poKg) || 0,
      unitPrice: (Number(poPrice) || 0) * 1000,
      deliveryTime: poTime,
      note: poNote,
      status: selectedOrder?.status || 'PENDING'
    };
    db.savePreOrder(order); reloadPreOrders(); setIsOrderModalOpen(false);
  }
  const handleDeleteOrder = () => {
    if (!selectedOrder) return;
    if (confirm("Xoá đơn đặt hàng này?")) {
      db.deletePreOrder(selectedOrder.id); reloadPreOrders(); setIsOrderModalOpen(false);
    }
  }
  const handleMarkPreparedOrder = () => {
    if (!selectedOrder) return;
    const prepared = { ...selectedOrder, status: 'PREPARED' as const };
    db.savePreOrder(prepared); reloadPreOrders(); setIsOrderModalOpen(false);
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

  const handleDeliverSuccess = async () => {
    if (!selectedOrder) return;

    const qtyCon = Number(poCon) || 0;
    const qtyKg = Number(poKg) || 0;
    const unitPrice = (Number(poPrice) || 0) * 1000;

    if (!poName || !poProduct || !poTime) return alert('Vui lòng nhập đủ khách hàng, hàng hoá và thời gian giao.');
    if (qtyCon <= 0 && qtyKg <= 0) return alert('Cần nhập ít nhất Số con hoặc Số kg.');
    if (unitPrice <= 0) return alert('Vui lòng nhập đơn giá hợp lệ để xuất hoá đơn.');

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
      unit: qtyKg > 0 ? 'KG' : 'CON',
      price: unitPrice,
      gender: 'MALE'
    } : {
      productId: 'MANUAL',
      productName: poProduct,
      qtyCon,
      qtyKg,
      unit: qtyKg > 0 ? 'KG' : 'CON',
      price: unitPrice,
      gender: 'MALE'
    };

    try {
      db.saveQuickCustomer(poName, poPhone);
      db.saveQuickItem(poProduct);
      const invoice = await db.createSale(customer.id, poTime.split('T')[0], [saleLine], 0);
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

      setTxns(db.getCashTransactions());
      setInvoices(db.getInvoices());
      reloadPreOrders();
      setIsOrderModalOpen(false);

      setSelectedInvoice(invoice);
      setSelectedTxn({
        id: `txn-order-${Date.now()}`,
        date: new Date().toISOString(),
        type: 'DEBT',
        amount: invoice.totalAmount,
        description: `Giao hàng thành công: ${invoice.partnerName}`,
        refId: invoice.id
      } as any);

      alert('Đã giao hàng thành công và xuất hoá đơn.');
    } catch (e: any) {
      alert(e.message || 'Không thể xuất hoá đơn giao hàng.');
    }
  }
  const formatTime = (isoString: string) => { try { const d = new Date(isoString); return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`; } catch(e) { return ''; } }
  const formatDateShort = (isoString: string) => { try { const d = new Date(isoString); return `${d.getDate()}/${d.getMonth()+1}`; } catch (e) { return ''; } }
  const getInvoiceGenderSummary = (invoiceId?: string) => {
    if (!invoiceId) return '';
    const inv = invoices.find(item => item.id === invoiceId);
    if (!inv) return '';
    const summary = (inv.lines || [])
      .filter(line => line.productId !== 'MANUAL')
      .map(line => `${line.productName} (${line.gender === 'FEMALE' ? 'Mái' : 'Trống'})`);
    return Array.from(new Set(summary)).join(' • ');
  };
  const getPaymentMethodLabel = (method?: PaymentMethod) => {
    if (method === PaymentMethod.CASH) return 'Tiền mặt';
    if (method === PaymentMethod.TRANSFER) return 'Chuyển khoản';
    if (method === PaymentMethod.DEBT) return 'Ghi nợ';
    return 'Chưa xác định';
  }

  const handleDeleteSelectedTransaction = async () => {
    if (!selectedTxn) return;

    const invoiceId = selectedInvoice?.id || selectedTxn.refId;
    const cashTransactionId = invoiceId ? undefined : selectedTxn.id;

    try {
      const preview = db.getDeleteTransactionImpact({ invoiceId, cashTransactionId });
      const s = preview.impactSummary;
      const detailLines = (preview.stockImpactDetails || []).map((item: any) => {
        const signCon = item.deltaCon > 0 ? '+' : '';
        const signKg = item.deltaKg > 0 ? '+' : '';
        return `  • ${item.productName} (${item.gender === 'FEMALE' ? 'Mái' : 'Trống'}): ${signCon}${item.deltaCon} con, ${signKg}${item.deltaKg.toFixed(1)}kg | Tồn: ${item.beforeCon}→${item.afterCon} con`;
      });
      const warning = [
        '⚠ XÓA GIAO DỊCH SẼ LÀM THAY ĐỔI DỮ LIỆU:',
        `- Tồn kho tăng: +${s.stockIncreaseCon} con (${s.stockIncreaseKg.toFixed(1)}kg)`,
        `- Tồn kho giảm: -${s.stockDecreaseCon} con (${s.stockDecreaseKg.toFixed(1)}kg)`,
        `- Công nợ thay đổi: ${formatCurrency(s.partnerDebtDelta)}`,
        `- Tiền quỹ thay đổi: ${formatCurrency(s.cashDelta)}`,
        ...(detailLines.length > 0 ? ['', 'Chi tiết loại gà thay đổi:', ...detailLines] : []),
        '',
        'Bạn có chắc chắn muốn xoá?'
      ].join('\n');

      const confirmed = window.confirm(warning);
      if (!confirmed) return;

      const reason = (window.prompt('Nhập lý do xoá giao dịch (bắt buộc):') || '').trim();
      if (!reason) {
        alert('Bạn phải nhập lý do thì mới có thể xoá.');
        return;
      }

      await db.deleteTransactionHistory({ invoiceId, cashTransactionId, reason });
      setTxns(db.getCashTransactions());
      setInvoices(db.getInvoices());
      setDeletedTxns(db.getDeletedTransactionHistories(200));
      setSelectedTxn(null);
      setSelectedInvoice(undefined);
      alert('Đã xoá giao dịch và ghi vào lịch sử xoá.');
    } catch (e: any) {
      alert(e.message || 'Không thể xoá giao dịch.');
    }
  }

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
        <div className="flex surface-card rounded-lg p-1 mb-3">
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

        <div className="flex items-center justify-between surface-elevated rounded-lg px-2 py-2 border border-gray-200">
            <button onClick={handlePrev} className="p-2 hover:bg-gray-100 rounded-full text-brand-700 font-bold">❮</button>
            <div className="text-center">
                <span className="text-xs text-gray-400 font-medium uppercase block">{viewMode === 'MONTH' ? 'Tháng Đang Xem' : 'Năm Tài Chính'}</span>
                <span className="text-lg font-black text-gray-800">{getTitle()}</span>
            </div>
            <button onClick={handleNext} className="p-2 hover:bg-gray-100 rounded-full text-brand-700 font-bold">❯</button>
        </div>
      </Card>

      <Card className="mb-4 p-0 overflow-hidden">
        <div className="p-4 flex items-center justify-between gap-3">
          <button onClick={handleSummaryMenuClick} className="flex-1 text-left hover:opacity-90 transition-opacity">
            <h3 className="text-base font-bold text-gray-800">Chỉ số Sổ quỹ</h3>
            <p className="text-xs text-gray-500 mt-1">
              {!isSummaryUnlocked ? 'Nhấn để nhập mã và mở bảng chỉ số' : isSummaryExpanded ? 'Đang mở chi tiết. Nhấn lại để thu gọn.' : 'Đã mở khoá. Nhấn để xem lại chi tiết.'}
            </p>
          </button>
          <button
            onClick={handleSummarySecurityToggle}
            className={`text-xs font-bold px-2 py-1 rounded border ${isSummaryUnlocked ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}
          >
            {isSummaryUnlocked ? 'Đóng' : 'Xem'}
          </button>
        </div>

        {isSummaryExpanded && isSummaryUnlocked && (
          <div className="border-t border-gray-100 p-3 bg-gray-50">
            <div className="grid grid-cols-2 gap-2">
              <div className="surface-card p-3 rounded-lg">
                <div className="text-xs text-gray-500 uppercase font-bold">TỔNG THU ({viewMode === 'MONTH' ? 'THÁNG' : 'NĂM'})</div>
                <div className="text-lg font-bold text-green-600">{formatCurrency(periodIncome)}</div>
              </div>
              <div className="surface-card p-3 rounded-lg">
                <div className="text-xs text-gray-500 uppercase font-bold">TỔNG CHI ({viewMode === 'MONTH' ? 'THÁNG' : 'NĂM'})</div>
                <div className="text-lg font-bold text-red-600">{formatCurrency(periodExpense)}</div>
              </div>
              <div className="surface-card p-3 rounded-lg">
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
          </div>
        )}
      </Card>

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

      {/* TRANSACTION LIST (Đã lọc theo thời gian) */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-bold text-gray-700">{historyView === 'ACTIVE' ? `Lịch sử giao dịch (${mixedList.length})` : `Lịch sử xoá (${deletedTxns.length})`}</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setHistoryView('ACTIVE')}
            className={`text-xs px-2 py-1 rounded border font-bold ${historyView === 'ACTIVE' ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-300'}`}
          >
            Lịch sử giao dịch
          </button>
          <button
            onClick={() => setHistoryView('DELETED')}
            className={`text-xs px-2 py-1 rounded border font-bold ${historyView === 'DELETED' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-300'}`}
          >
            Lịch sử xoá
          </button>
        </div>
      </div>

      {historyView === 'ACTIVE' ? (
        <div className="space-y-2">
          {mixedList.length === 0 ? <p className="text-sm text-gray-400 italic text-center py-4">Không có giao dịch trong kỳ này</p> :
          mixedList.map(t => (
            <div 
              key={t.id} 
              onDoubleClick={() => handleSelectTxn(t)}
              className="surface-card p-3 rounded flex justify-between items-center active:bg-gray-50 cursor-pointer"
            >
              <div className="flex-1 min-w-0 pr-2">
                <div className="flex justify-between items-baseline">
                  <div className="font-medium text-gray-800 text-sm truncate">{t.description}</div>
                  <div className="text-[10px] text-gray-400 whitespace-nowrap ml-2">{formatTime(t.date)} {formatDateShort(t.date)}</div>
                </div>
                {t.refId && (
                  <div className="text-[11px] text-gray-500 mt-1 truncate">{getInvoiceGenderSummary(t.refId)}</div>
                )}
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
      ) : (
        <div className="space-y-2">
          {deletedTxns.length === 0 ? <p className="text-sm text-gray-400 italic text-center py-4">Chưa có giao dịch bị xoá</p> : deletedTxns.map(item => (
            <div key={item.id} className="surface-card p-3 rounded border border-red-100">
              <div className="flex justify-between items-start gap-2">
                <div>
                  <div className="font-bold text-sm text-gray-800">
                    {item.type === 'INVOICE'
                      ? `Đã xoá hoá đơn ${item.invoiceCode || item.invoiceId}`
                      : `Đã xoá giao dịch tiền ${item.cashTransactionId}`}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-1">{new Date(item.deletedAt).toLocaleString('vi-VN')}</div>
                </div>
                <div className="text-right text-xs text-gray-600">
                  <div>Tăng kho: +{item.impactSummary.stockIncreaseCon} con</div>
                  <div>Giảm kho: -{item.impactSummary.stockDecreaseCon} con</div>
                </div>
              </div>
              <div className="text-xs text-red-700 mt-2">Lý do: <span className="font-semibold">{item.reason}</span></div>
              {item.snapshot.invoice && (
                <div className="text-xs text-gray-600 mt-1">Chi tiết: {item.snapshot.invoice.lines.map(line => `${line.productName} (${line.gender === 'FEMALE' ? 'Mái' : 'Trống'})`).join(' • ')}</div>
              )}
              {(item.stockImpactDetails || []).length > 0 && (
                <div className="mt-2 space-y-1">
                  {(item.stockImpactDetails || []).map((d, idx) => (
                    <div key={`${item.id}-impact-${idx}`} className="text-[11px] text-gray-600">
                      {d.productName} ({d.gender === 'FEMALE' ? 'Mái' : 'Trống'}): {d.deltaCon > 0 ? '+' : ''}{d.deltaCon} con, {d.deltaKg > 0 ? '+' : ''}{d.deltaKg.toFixed(1)}kg · tồn {d.beforeCon} → {d.afterCon} con
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Transaction Details Modal */}
      <Modal isOpen={!!selectedTxn} onClose={handleCloseTxnModal} title="Chi Tiết Giao Dịch">
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
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleDeleteSelectedTransaction}
                        className="text-xs font-bold text-red-700 underline"
                      >
                        Xoá giao dịch
                      </button>
                    </div>
                    {selectedInvoice && selectedInvoice.type !== 'IMPORT' && (
                      <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-sm">
                        <span className="text-gray-500">Phương thức thanh toán:</span>{' '}
                        <span className="font-bold text-blue-700">{getPaymentMethodLabel(selectedInvoice.paymentMethod)}</span>
                        {selectedInvoice.type === 'EXPORT' && (
                          <div className="mt-2">
                            <button
                              type="button"
                              onClick={handleOpenEditInvoice}
                              className="text-xs font-bold text-blue-700 underline"
                            >
                              Chỉnh sửa giao dịch
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    {selectedInvoice && (
                        selectedInvoice.type === 'IMPORT' ? (
                          <div className="surface-elevated rounded border border-gray-200 overflow-hidden max-h-[60vh] overflow-y-auto">
                            <div className="p-4 text-center border-b border-gray-200 border-dashed">
                              <h2 className="text-xl font-extrabold text-gray-800 uppercase tracking-widest">Phiếu Nhập Hàng</h2>
                              <p className="text-xs text-gray-500 mt-1">{new Date(selectedTxn?.date || selectedInvoice.date).toLocaleString('vi-VN')}</p>
                              <div className="mt-3 text-left bg-gray-50 p-2 rounded text-sm border border-gray-200">
                                <div><span className="font-bold text-gray-600">NCC:</span> {selectedInvoice.partnerName}</div>
                              </div>
                            </div>

                            <div className="p-2">
                              {selectedInvoice.lines.map((line, idx) => (
                                <div key={idx} className="mb-3 border border-gray-200 rounded-md overflow-hidden text-sm surface-card">
                                  <div className="bg-gray-100 px-3 py-2 font-bold text-gray-800">
                                    {idx + 1}. {line.productName} ({line.gender === 'FEMALE' ? 'Mái' : 'Trống'})
                                  </div>
                                  <div className="p-3 grid grid-cols-2 gap-y-1 gap-x-4 text-gray-600">
                                    <div>Tổng cân: <span className="font-bold text-gray-800">{Number(line.gross || line.qtyKg).toFixed(2)} kg</span></div>
                                    <div>Trừ bì: <span className="font-bold text-red-600">-{Number(line.tare || 0).toFixed(2)} kg</span></div>
                                    <div className="col-span-2 border-b border-gray-100 my-1"></div>
                                    <div>Thực nhập: <span className="font-bold text-blue-600">{line.qtyKg.toFixed(2)} kg</span></div>
                                    <div>Số lượng: <span className="font-bold text-blue-600">{line.qtyCon} con</span></div>
                                    <div className="col-span-2 text-xs italic text-gray-400 mt-1">Chi tiết: {line.details || '-'}</div>
                                    <div className="col-span-2 border-t border-gray-200 mt-2 pt-2 flex justify-between items-center">
                                      <span>Đơn giá: {(line.price / 1000).toLocaleString('vi-VN')} nghìn VND/kg</span>
                                      <span className="text-lg font-bold text-gray-800">{formatCurrency(line.amount)}</span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>

                            <div className="bg-gray-800 text-white p-4">
                              <div className="flex justify-between items-center text-sm mb-1">
                                <span className="text-gray-300">Tổng bì (lồng):</span>
                                <span>{selectedInvoice.lines.reduce((sum, line) => sum + Number(line.tare || 0), 0).toFixed(2)} kg</span>
                              </div>
                              <div className="flex justify-between items-center text-sm mb-3">
                                <span className="text-gray-300">Tổng thực nhập:</span>
                                <span>{selectedInvoice.lines.reduce((sum, line) => sum + line.qtyKg, 0).toFixed(2)} kg</span>
                              </div>
                              <div className="border-t border-gray-600 pt-3 flex justify-between items-center">
                                <span className="font-bold text-lg uppercase">Tổng Tiền:</span>
                                <span className="text-2xl font-bold text-yellow-400">{formatCurrency(selectedInvoice.totalAmount)}</span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3 max-h-[70vh] overflow-y-auto surface-card rounded p-2">
                            {isEditInvoiceMode ? (
                              <>
                                <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                                  <div className="flex justify-between items-end mb-2">
                                    <div className="text-sm font-bold text-gray-700">Thêm hàng vào giao dịch</div>
                                    <button
                                      onClick={() => openEditProductPicker('MANUAL')}
                                      className="text-xs font-bold text-brand-600 border border-brand-200 px-2 py-1 rounded bg-brand-50"
                                    >
                                      + Nhập hàng ngoài
                                    </button>
                                  </div>

                                  <div className="grid grid-cols-2 gap-2 mb-3">
                                    {productOptions.map(product => (
                                      <button
                                        key={product.id}
                                        onClick={() => openEditProductPicker(product.id)}
                                        className={`text-left p-2 rounded border text-xs font-bold ${editActiveProductId === product.id && !editIsManualItem ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'}`}
                                      >
                                        {product.name}
                                      </button>
                                    ))}
                                  </div>

                                  {editActiveProductId && (
                                    <div className="space-y-3 border border-blue-100 bg-white rounded-lg p-3">
                                      {editIsManualItem ? (
                                        <Input
                                          label="Tên hàng ngoài"
                                          value={editManualName}
                                          onChange={(e: any) => setEditManualName(e.target.value)}
                                          placeholder="VD: Gà đi bộ"
                                        />
                                      ) : (
                                        <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
                                          <button
                                            onClick={() => {
                                              setEditSaleGender('MALE');
                                              const product = getEditProductById(editActiveProductId);
                                              if (product && !editUseManualPrice) setEditPrice(((product.priceMale || 0) / 1000).toString());
                                            }}
                                            className={`flex-1 py-2 text-xs font-bold rounded ${editSaleGender === 'MALE' ? 'bg-white text-blue-600 shadow' : 'text-gray-500'}`}
                                          >
                                            GÀ TRỐNG
                                          </button>
                                          <button
                                            onClick={() => {
                                              setEditSaleGender('FEMALE');
                                              const product = getEditProductById(editActiveProductId);
                                              if (product && !editUseManualPrice) setEditPrice(((product.priceFemale || 0) / 1000).toString());
                                            }}
                                            className={`flex-1 py-2 text-xs font-bold rounded ${editSaleGender === 'FEMALE' ? 'bg-white text-pink-600 shadow' : 'text-gray-500'}`}
                                          >
                                            GÀ MÁI
                                          </button>
                                        </div>
                                      )}

                                      <div className="grid grid-cols-2 gap-2">
                                        <Input label="Số Kg" type="number" value={editQtyKg} onChange={(e: any) => setEditQtyKg(e.target.value)} placeholder="0.0" />
                                        <Input label="Số Con" type="number" value={editQtyCon} onChange={(e: any) => setEditQtyCon(e.target.value)} placeholder="0" />
                                      </div>

                                      <div>
                                        <div className="flex justify-between mb-1">
                                          <label className="text-xs font-bold text-gray-600">Đơn giá (nghìn VND)</label>
                                          {!editIsManualItem && (
                                            <button onClick={() => setEditUseManualPrice(prev => !prev)} className="text-xs text-brand-600 underline">
                                              {editUseManualPrice ? 'Dùng giá mặc định' : 'Sửa giá'}
                                            </button>
                                          )}
                                        </div>
                                        {editIsManualItem || editUseManualPrice ? (
                                          <Input type="number" value={editPrice} onChange={(e: any) => setEditPrice(e.target.value)} placeholder="VD: 95" />
                                        ) : (
                                          <div className="w-full px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-gray-700">
                                            {formatCurrency((Number(editPrice) || 0) * 1000)}
                                          </div>
                                        )}
                                      </div>

                                      <Button className="w-full" onClick={handleAddEditCartItem}>Thêm vào giỏ chỉnh sửa</Button>
                                    </div>
                                  )}
                                </div>

                                <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
                                  <div className="bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                    Giỏ giao dịch ({editCart.length})
                                  </div>
                                  <div className="divide-y divide-gray-100">
                                    {editCart.length === 0 ? (
                                      <div className="p-3 text-sm text-gray-400">Chưa có dòng hàng.</div>
                                    ) : (
                                      editCart.map((item, idx) => (
                                        <div key={`${item.productId}-${idx}`} className="p-3 flex justify-between items-center">
                                          <div>
                                            <div className="font-medium text-gray-800 text-sm">{item.productName} {item.productId !== 'MANUAL' ? `(${item.gender === 'FEMALE' ? 'Mái' : 'Trống'})` : ''}</div>
                                            <div className="text-xs text-gray-500">
                                              {item.qtyKg > 0 ? `${item.qtyKg} kg` : ''}
                                              {item.qtyKg > 0 && item.qtyCon > 0 ? ' / ' : ''}
                                              {item.qtyCon > 0 ? `${item.qtyCon} con` : ''}
                                              {' x '}{formatCurrency(item.price)}
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-3">
                                            <span className="font-bold text-sm text-gray-700">{formatCurrency(item.amount)}</span>
                                            <button onClick={() => handleRemoveEditCartItem(idx)} className="text-red-500 text-xs font-bold">Xóa</button>
                                          </div>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </div>

                                <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                                  <div className="text-xs font-bold text-gray-600 mb-2">Phương thức thanh toán</div>
                                  <div className="flex gap-2 mb-3">
                                    <button onClick={() => setEditPaymentMethod(PaymentMethod.CASH)} className={`flex-1 py-2 text-xs font-bold rounded border ${editPaymentMethod === PaymentMethod.CASH ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-300'}`}>TIỀN MẶT</button>
                                    <button onClick={() => setEditPaymentMethod(PaymentMethod.TRANSFER)} className={`flex-1 py-2 text-xs font-bold rounded border ${editPaymentMethod === PaymentMethod.TRANSFER ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'}`}>CHUYỂN KHOẢN</button>
                                    <button onClick={() => setEditPaymentMethod(PaymentMethod.DEBT)} className={`flex-1 py-2 text-xs font-bold rounded border ${editPaymentMethod === PaymentMethod.DEBT ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-600 border-gray-300'}`}>GHI NỢ</button>
                                  </div>

                                  <div className="grid grid-cols-2 gap-2">
                                    <Input
                                      label="Tiền công"
                                      type="number"
                                      value={editLaborFee}
                                      onChange={(e: any) => setEditLaborFee(Number(e.target.value) || 0)}
                                    />
                                    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 flex flex-col justify-center">
                                      <div className="text-xs text-gray-500">Tổng mới</div>
                                      <div className="text-lg font-bold text-brand-600">{formatCurrency(editablePreviewTotal)}</div>
                                    </div>
                                  </div>

                                  <div className="mt-2 text-xs text-gray-500">
                                    {editPaymentMethod === PaymentMethod.DEBT
                                      ? 'Khách ghi nợ toàn bộ đơn sau chỉnh sửa.'
                                      : `Sẽ cập nhật thu tiền: ${formatCurrency(Math.max(0, editablePreviewTotal))}`}
                                  </div>
                                </div>

                                <div className="bg-yellow-50 border border-yellow-200 rounded p-2">
                                  <Input
                                    label="Lý do chỉnh sửa (bắt buộc)"
                                    value={editReason}
                                    onChange={(e: any) => setEditReason(e.target.value)}
                                    placeholder="VD: Nhập sai số kg khi cân..."
                                  />
                                </div>
                                <div className="flex gap-2 pt-1">
                                  <Button variant="secondary" className="flex-1" onClick={() => setIsEditInvoiceMode(false)}>Hủy</Button>
                                  <Button className="flex-1" onClick={handleSaveEditedInvoice} disabled={isSavingInvoiceEdit}>
                                    {isSavingInvoiceEdit ? 'Đang lưu...' : 'Lưu chỉnh sửa'}
                                  </Button>
                                </div>
                              </>
                            ) : (
                              <>
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
                              </>
                            )}
                          </div>
                        )
                    )}
                    {!isEditInvoiceMode && selectedInvoice && selectedInvoice.type === 'EXPORT' && (selectedInvoice.editHistory || []).length > 0 && (
                      <div className="surface-card border border-gray-200 rounded-lg p-3">
                        <div className="text-xs font-bold text-gray-600 uppercase mb-2">Lịch sử chỉnh sửa</div>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {(selectedInvoice.editHistory || []).map((entry, idx) => (
                            <div key={idx} className="text-xs bg-gray-50 border border-gray-100 rounded p-2">
                              <div className="font-semibold text-gray-700">{new Date(entry.editedAt).toLocaleString('vi-VN')}</div>
                              <div className="text-gray-600">Lý do: <span className="font-medium">{entry.reason}</span></div>
                              <div className="text-gray-500">{formatCurrency(entry.previousTotalAmount)} → {formatCurrency(entry.newTotalAmount)}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                </>
            )}
            <Button className="w-full" onClick={handleCloseTxnModal}>Đóng</Button>
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
  const [isDebtMenuOpen, setIsDebtMenuOpen] = useState(false);
  const [isNameMenuOpen, setIsNameMenuOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal Add/Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formType, setFormType] = useState<PartnerType>(PartnerType.CUSTOMER);
  const [formSupplierCategory, setFormSupplierCategory] = useState<SupplierCategory>('FARM');
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

  const debtFilterLabel = debtFilter === 'HAS_DEBT' ? 'Có nợ' : debtFilter === 'NO_DEBT' ? 'Hết nợ' : 'Mọi công nợ';
  const nameFilterLabel = nameFilter === 'A_Z' ? 'Tên A → Z' : nameFilter === 'Z_A' ? 'Tên Z → A' : 'Mặc định';

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
      setFormSupplierCategory(p.supplierCategory || 'FARM');
      setFormDebt(p.debt.toString());
    } else {
      setEditingId(null);
      setFormName('');
      setFormPhone('');
      setFormType(PartnerType.CUSTOMER);
      setFormSupplierCategory('FARM');
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
      supplierCategory: formType === PartnerType.SUPPLIER ? formSupplierCategory : undefined,
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

       <div className="flex gap-2 mb-4">
         <div className="relative flex-1">
           <button
             onClick={() => { setIsDebtMenuOpen(prev => !prev); setIsNameMenuOpen(false); }}
             className="w-full px-3 py-2 rounded-lg surface-card border border-gray-300 text-sm font-semibold text-gray-700 flex items-center justify-between"
           >
             <span>Lọc theo nợ: {debtFilterLabel}</span>
             <span className="text-xs">▾</span>
           </button>
           {isDebtMenuOpen && (
             <div className="absolute z-20 mt-1 w-full surface-elevated border border-gray-200 rounded-lg p-1">
               <button onClick={() => { setDebtFilter('ALL'); setIsDebtMenuOpen(false); }} className={`w-full text-left px-3 py-2 rounded text-sm ${debtFilter === 'ALL' ? 'bg-gray-100 text-gray-900 font-bold' : 'text-gray-700 hover:bg-gray-50'}`}>Mọi công nợ</button>
               <button onClick={() => { setDebtFilter('HAS_DEBT'); setIsDebtMenuOpen(false); }} className={`w-full text-left px-3 py-2 rounded text-sm ${debtFilter === 'HAS_DEBT' ? 'bg-orange-50 text-orange-700 font-bold' : 'text-gray-700 hover:bg-gray-50'}`}>Có nợ</button>
               <button onClick={() => { setDebtFilter('NO_DEBT'); setIsDebtMenuOpen(false); }} className={`w-full text-left px-3 py-2 rounded text-sm ${debtFilter === 'NO_DEBT' ? 'bg-green-50 text-green-700 font-bold' : 'text-gray-700 hover:bg-gray-50'}`}>Hết nợ</button>
             </div>
           )}
         </div>

         <div className="relative flex-1">
           <button
             onClick={() => { setIsNameMenuOpen(prev => !prev); setIsDebtMenuOpen(false); }}
             className="w-full px-3 py-2 rounded-lg surface-card border border-gray-300 text-sm font-semibold text-gray-700 flex items-center justify-between"
           >
             <span>Sắp xếp tên: {nameFilterLabel}</span>
             <span className="text-xs">▾</span>
           </button>
           {isNameMenuOpen && (
             <div className="absolute z-20 mt-1 w-full surface-elevated border border-gray-200 rounded-lg p-1">
               <button onClick={() => { setNameFilter('ALL'); setIsNameMenuOpen(false); }} className={`w-full text-left px-3 py-2 rounded text-sm ${nameFilter === 'ALL' ? 'bg-gray-100 text-gray-900 font-bold' : 'text-gray-700 hover:bg-gray-50'}`}>Mặc định</button>
               <button onClick={() => { setNameFilter('A_Z'); setIsNameMenuOpen(false); }} className={`w-full text-left px-3 py-2 rounded text-sm ${nameFilter === 'A_Z' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-gray-700 hover:bg-gray-50'}`}>Tên A → Z</button>
               <button onClick={() => { setNameFilter('Z_A'); setIsNameMenuOpen(false); }} className={`w-full text-left px-3 py-2 rounded text-sm ${nameFilter === 'Z_A' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-gray-700 hover:bg-gray-50'}`}>Tên Z → A</button>
             </div>
           )}
         </div>
       </div>

       {/* Partner List */}
       <div className="space-y-3">
         {partners.map(p => (
           <div key={p.id} onClick={() => handleOpenDetail(p)} className="surface-card p-3 rounded-lg flex justify-between items-center active:bg-blue-50 cursor-pointer transition-colors hover:border-blue-200">
             <div>
               <div className="font-bold text-gray-800 flex items-center gap-2">
                 {p.name} 
                 <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide font-bold ${p.type === 'CUSTOMER' ? 'bg-orange-100 text-orange-700' : p.supplierCategory === 'COMPANY' ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-100 text-blue-700'}`}>
                   {p.type === 'CUSTOMER' ? 'Khách' : p.supplierCategory === 'COMPANY' ? 'Công ty' : 'Trại'}
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
            {formType === PartnerType.SUPPLIER && (
              <Select
                label="Phân loại nhà cung cấp"
                value={formSupplierCategory}
                onChange={(e: any) => setFormSupplierCategory(e.target.value)}
                options={[
                  { value: 'FARM', label: 'Trại tư nhân (mặc định kiểu bì theo lồng)' },
                  { value: 'COMPANY', label: 'Công ty (mặc định kiểu bì thực tế)' }
                ]}
              />
            )}
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
                            className="surface-card border border-orange-100 rounded-lg p-3 flex justify-between items-center cursor-pointer hover:bg-orange-50"
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
                         <div key={idx} className="flex flex-col p-3 border-b last:border-0 border-gray-100 surface-card rounded">
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
    <div className="min-h-screen surface-page font-sans text-slate-800">
      <main className="max-w-md mx-auto min-h-screen surface-card relative">
        <div className="p-4 overflow-y-auto h-full no-scrollbar pb-24 surface-page">
           {renderPage()}
        </div>

        {/* Bottom Navigation for Mobile */}
        <div className="fixed bottom-0 left-0 right-0 surface-elevated border-t border-gray-200 z-50 max-w-md mx-auto">
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