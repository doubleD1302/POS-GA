import React, { useEffect, useState } from 'react';
import { db } from '../services/db';
import { Batch, Product } from '../types';
import { Button, Modal, Input, SecureValue } from '../components/ui';
import { formatCurrency, formatDate } from '../constants';

export default function Inventory() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  
  // State để quản lý việc mở rộng/thu gọn chi tiết gà
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Product Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formName, setFormName] = useState('');
  const [priceMale, setPriceMale] = useState('');
  const [priceFemale, setPriceFemale] = useState('');
  const [costMale, setCostMale] = useState(''); 
  const [costFemale, setCostFemale] = useState(''); 

  // Batch Edit Modal State
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState<Batch | null>(null);
  const [editKg, setEditKg] = useState('');
  const [editCon, setEditCon] = useState('');
  const [newAdjustmentInfo, setNewAdjustmentInfo] = useState<{pid: string, gender: string} | null>(null);

  // Batch List Modal
  const [isBatchListOpen, setIsBatchListOpen] = useState(false);
  const [selectedBatchesForEdit, setSelectedBatchesForEdit] = useState<Batch[]>([]);
  const [selectedProductTitle, setSelectedProductTitle] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setProducts(db.getProducts());
    setBatches(db.getBatches());
  };

  // --- LOGIC SẢN PHẨM ---
  const handleOpenModal = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setFormName(product.name);
      setPriceMale(product.priceMale ? (product.priceMale / 1000).toString() : '');
      setPriceFemale(product.priceFemale ? (product.priceFemale / 1000).toString() : '');
      setCostMale(product.costMale ? (product.costMale / 1000).toString() : '');
      setCostFemale(product.costFemale ? (product.costFemale / 1000).toString() : '');
    } else {
      setEditingProduct(null);
      setFormName('');
      setPriceMale(''); setPriceFemale('');
      setCostMale(''); setCostFemale('');
    }
    setIsModalOpen(true);
  };

  const handleSaveProduct = () => {
    if (!formName) return alert("Vui lòng điền tên gà");
    
    const newProduct: Product = {
      id: editingProduct ? editingProduct.id : `p-${Date.now()}`,
      name: formName,
      priceMale: (Number(priceMale) * 1000) || 0,
      priceFemale: (Number(priceFemale) * 1000) || 0,
      costMale: (Number(costMale) * 1000) || 0,
      costFemale: (Number(costFemale) * 1000) || 0,
    };
    
    db.saveProduct(newProduct);
    loadData();
    setIsModalOpen(false);
  };

  const handleDeleteProduct = (id: string) => {
    if (window.confirm("Xóa sản phẩm này sẽ không xóa các lô hàng cũ. Tiếp tục?")) {
      db.deleteProduct(id);
      setTimeout(() => loadData(), 50);
    }
  };

  // --- LOGIC SỬA KHO (BATCH) ---
  const handleOpenBatchEdit = (batch: Batch) => {
    setEditingBatch(batch);
    setEditKg(batch.qtyRemKg.toString());
    setEditCon(batch.qtyRemCon.toString());
    setIsBatchModalOpen(true);
    setIsBatchListOpen(false);
  }

  const handleSaveBatch = async () => {
    const kg = parseFloat(editKg);
    const con = parseInt(editCon);
    if (isNaN(kg) || isNaN(con)) return alert("Số liệu không hợp lệ");

    if (editingBatch) {
       db.updateBatch(editingBatch.id, { qtyRemKg: kg, qtyRemCon: con });
    } 
    else if (newAdjustmentInfo) {
       await db.createDirectAdjustment(newAdjustmentInfo.pid, newAdjustmentInfo.gender, kg, con);
    } 
    else {
       return;
    }

    loadData();
    setIsBatchModalOpen(false);
    setNewAdjustmentInfo(null);
  }

  const handleEditStockFromCategory = (pid: string, gender: 'MALE' | 'FEMALE', pName: string) => {
      const targetBatches = batches.filter(b => b.productId === pid && b.status === 'OPEN' && (b.gender === gender || !b.gender));
      
      if (targetBatches.length === 0) {
          if(window.confirm(`Chưa có lô hàng nào cho ${pName} (${gender === 'MALE' ? 'Trống' : 'Mái'}). Bạn muốn tạo tồn kho mới?`)) {
             setNewAdjustmentInfo({ pid, gender });
             setEditingBatch(null);
             setEditKg('');
             setEditCon('');
             setIsBatchModalOpen(true);
          }
          return;
      }

      if (targetBatches.length === 1) {
          setNewAdjustmentInfo(null);
          handleOpenBatchEdit(targetBatches[0]);
      } else {
          setSelectedBatchesForEdit(targetBatches);
          setSelectedProductTitle(`${pName} (${gender === 'MALE' ? 'Trống' : 'Mái'})`);
          setIsBatchListOpen(true);
      }
  }

  const getStock = (pid: string) => {
      const openBatches = batches.filter(b => b.productId === pid && b.status === 'OPEN');
      const male = openBatches.filter(b => b.gender === 'MALE' || !b.gender);
      const female = openBatches.filter(b => b.gender === 'FEMALE');

      return {
          male: { 
              kg: male.reduce((a, b) => a + b.qtyRemKg, 0), 
              con: male.reduce((a, b) => a + b.qtyRemCon, 0) 
          },
          female: { 
              kg: female.reduce((a, b) => a + b.qtyRemKg, 0), 
              con: female.reduce((a, b) => a + b.qtyRemCon, 0) 
          }
      };
  }

  // Toggle mở rộng item
  const toggleExpand = (id: string) => {
      if (expandedId === id) setExpandedId(null);
      else setExpandedId(id);
  }

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-bold text-brand-600">Quản Lý Kho</h1>
        <Button onClick={() => handleOpenModal()} className="text-sm px-3 py-1">+ Thêm Gà</Button>
      </div>

      {/* DANH SÁCH GÀ (DẠNG TỐI GIẢN) */}
      <div className="space-y-3">
           {products.map((p) => {
             const stock = getStock(p.id);
             const isExpanded = expandedId === p.id;
             
             return (
             <div key={p.id} className={`rounded-xl border transition-all overflow-hidden ${isExpanded ? 'border-brand-500 shadow-md bg-white' : 'border-gray-200 bg-white shadow-sm'}`}>
               
               {/* 1. PHẦN HIỂN THỊ TỐI GIẢN (Luôn hiện) */}
               <div 
                  onClick={() => toggleExpand(p.id)}
                  className={`flex justify-between items-center p-4 cursor-pointer hover:bg-gray-50 ${isExpanded ? 'border-b border-gray-100 bg-brand-50' : ''}`}
               >
                  <div className="flex items-center gap-2">
                      {/* Icon mũi tên xoay */}
                      <span className={`text-gray-400 text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                      <h3 className="font-bold text-gray-800 uppercase text-lg">{p.name}</h3>
                  </div>
                  
                  {/* Hiển thị tóm tắt số lượng */}
                  <div className="flex items-center gap-3 text-sm font-bold font-mono">
                     <div className="text-blue-700 bg-blue-50 px-2 py-1 rounded">
                        {stock.male.con} T
                     </div>
                     <div className="text-gray-300">|</div>
                     <div className="text-pink-600 bg-pink-50 px-2 py-1 rounded">
                        {stock.female.con} M
                     </div>
                  </div>
               </div>

               {/* 2. PHẦN CHI TIẾT (Chỉ hiện khi bấm vào) */}
               {isExpanded && (
               <div className="animate-in fade-in duration-200">
                   {/* Thanh công cụ con */}
                   <div className="flex justify-end gap-2 p-2 border-b border-gray-100 bg-white">
                        <button onClick={(e) => { e.stopPropagation(); handleOpenModal(p); }} className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded hover:bg-blue-100 flex items-center gap-1">
                            ⚙ Cài đặt giá
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteProduct(p.id); }} className="text-xs font-bold text-red-600 bg-red-50 px-3 py-1.5 rounded hover:bg-red-100 flex items-center gap-1">
                            🗑 Xóa
                        </button>
                   </div>

                   {/* Grid thông tin chi tiết: Trống vs Mái */}
                   <div className="grid grid-cols-2 gap-0 divide-x divide-gray-200 bg-white">
                      
                      {/* CỘT GÀ TRỐNG */}
                      <div className="p-3">
                          <div className="text-center text-blue-800 text-xs font-black uppercase mb-3">Gà Trống</div>
                          
                          {/* Giá */}
                          <div className="space-y-2 mb-4 text-sm">
                              <div className="flex justify-between border-b border-dashed border-gray-100 pb-1">
                                  <span className="text-gray-500 text-xs">Giá Nhập:</span>
                                  <span className="font-bold text-orange-600">{p.costMale ? <SecureValue value={formatCurrency(p.costMale)} /> : '_'}</span>
                              </div>
                              <div className="flex justify-between border-b border-dashed border-gray-100 pb-1">
                                  <span className="text-gray-500 text-xs">Giá Bán:</span>
                                  <span className="font-bold text-blue-600">{formatCurrency(p.priceMale)}</span>
                              </div>
                          </div>

                          {/* Tồn kho & Sửa */}
                          <div className="bg-blue-50 p-2 rounded border border-blue-100 relative group cursor-pointer" onClick={() => handleEditStockFromCategory(p.id, 'MALE', p.name)}>
                              <div className="text-[10px] text-blue-400 font-bold uppercase mb-1">Tồn kho (Sửa)</div>
                              <div className="flex justify-between items-end">
                                  <div className="leading-tight">
                                      <div className="font-black text-gray-800 text-xl">{stock.male.con} <span className="text-[10px] font-normal text-gray-500">con</span></div>
                                      <div className="text-xs text-gray-500 font-medium">{stock.male.kg.toFixed(1)} kg</div>
                                  </div>
                                  <div className="text-blue-500 opacity-50 group-hover:opacity-100 transition-opacity text-sm">✎</div>
                              </div>
                          </div>
                      </div>

                      {/* CỘT GÀ MÁI */}
                      <div className="p-3">
                          <div className="text-center text-pink-800 text-xs font-black uppercase mb-3">Gà Mái </div>
                          
                          {/* Giá */}
                          <div className="space-y-2 mb-4 text-sm">
                              <div className="flex justify-between border-b border-dashed border-gray-100 pb-1">
                                  <span className="text-gray-500 text-xs">Giá Nhập:</span>
                                  <span className="font-bold text-orange-600">{p.costFemale ? <SecureValue value={formatCurrency(p.costFemale)} /> : '_'}</span>
                              </div>
                              <div className="flex justify-between border-b border-dashed border-gray-100 pb-1">
                                  <span className="text-gray-500 text-xs">Giá Bán:</span>
                                  <span className="font-bold text-pink-600">{formatCurrency(p.priceFemale)}</span>
                              </div>
                          </div>

                           {/* Tồn kho & Sửa */}
                           <div className="bg-pink-50 p-2 rounded border border-pink-100 relative group cursor-pointer" onClick={() => handleEditStockFromCategory(p.id, 'FEMALE', p.name)}>
                              <div className="text-[10px] text-pink-400 font-bold uppercase mb-1">Tồn kho (Sửa)</div>
                              <div className="flex justify-between items-end">
                                  <div className="leading-tight">
                                      <div className="font-black text-gray-800 text-xl">{stock.female.con} <span className="text-[10px] font-normal text-gray-500">con</span></div>
                                      <div className="text-xs text-gray-500 font-medium">{stock.female.kg.toFixed(1)} kg</div>
                                  </div>
                                  <div className="text-pink-500 opacity-50 group-hover:opacity-100 transition-opacity text-sm">✎</div>
                              </div>
                          </div>
                      </div>
                   </div>
               </div>
               )}
             </div>
           )})}
      </div>

      {/* MODAL 1: Cài đặt sản phẩm (Giá/Tên) */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        title={editingProduct ? "Cài Đặt Giá & Tên" : "Thêm Sản Phẩm"}
      >
        <div className="space-y-4">
          <Input label="Tên loại gà" value={formName} onChange={(e: any) => setFormName(e.target.value)} placeholder="Ví dụ: Gà mía" />
          
          {/* Nhóm Gà Trống */}
          <div className="bg-blue-50 p-3 rounded border border-blue-100 grid grid-cols-2 gap-3">
             <div className="col-span-2 text-xs font-bold text-blue-700 uppercase">Gà Trống (Đơn vị: nghìn đ)</div>
             <Input label="Giá Nhập" type="number" value={costMale} onChange={(e: any) => setCostMale(e.target.value)} placeholder="VD: 50" />
             <Input label="Giá Bán" type="number" value={priceMale} onChange={(e: any) => setPriceMale(e.target.value)} placeholder="VD: 80" />
          </div>

          {/* Nhóm Gà Mái */}
           <div className="bg-pink-50 p-3 rounded border border-pink-100 grid grid-cols-2 gap-3">
             <div className="col-span-2 text-xs font-bold text-pink-600 uppercase">Gà Mái (Đơn vị: nghìn đ)</div>
             <Input label="Giá Nhập" type="number" value={costFemale} onChange={(e: any) => setCostFemale(e.target.value)} placeholder="VD: 40" />
             <Input label="Giá Bán" type="number" value={priceFemale} onChange={(e: any) => setPriceFemale(e.target.value)} placeholder="VD: 70" />
          </div>

          <p className="text-xs text-gray-500 italic">* Giá nhập này dùng để gợi ý khi nhập hàng. Giá vốn thực tế sẽ tính theo từng lô hàng.</p>
          <Button className="w-full" onClick={handleSaveProduct}>Lưu lại</Button>
        </div>
      </Modal>

      {/* MODAL 2: Sửa trực tiếp Batch */}
      <Modal isOpen={isBatchModalOpen} onClose={() => setIsBatchModalOpen(false)} title="Sửa Tồn Kho (Thực tế)">
         <div className="space-y-4">
            <div className="bg-yellow-50 p-2 rounded text-xs text-yellow-700 border border-yellow-200">
               Điều chỉnh số lượng thực tế trong kho.
            </div>
            <div className="grid grid-cols-2 gap-4">
                <Input label="Số Kg còn lại" type="number" value={editKg} onChange={(e: any) => setEditKg(e.target.value)} autoFocus />
                <Input label="Số Con còn lại" type="number" value={editCon} onChange={(e: any) => setEditCon(e.target.value)} />
            </div>
            <Button className="w-full" onClick={handleSaveBatch}>Cập nhật kho</Button>
         </div>
      </Modal>

      {/* MODAL 3: Danh sách Batch để chọn sửa (Nếu có nhiều lô) */}
      <Modal isOpen={isBatchListOpen} onClose={() => setIsBatchListOpen(false)} title={`Chọn lô để sửa: ${selectedProductTitle}`}>
          <div className="space-y-2 max-h-80 overflow-y-auto">
              <p className="text-xs text-gray-500 mb-2">Loại gà này có nhiều đợt nhập khác nhau. Vui lòng chọn lô cần điều chỉnh:</p>
              {selectedBatchesForEdit.map(b => (
                  <div key={b.id} onClick={() => handleOpenBatchEdit(b)} className="flex justify-between items-center p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer shadow-sm">
                      <div>
                          <div className="font-bold text-gray-800">{formatDate(b.date)}</div>
                          <div className="text-xs text-gray-500">{b.supplierName}</div>
                      </div>
                      <div className="text-right">
                          <div className="font-bold text-brand-600">{b.qtyRemCon} con</div>
                          <div className="text-xs text-gray-500">{b.qtyRemKg.toFixed(1)} kg</div>
                      </div>
                  </div>
              ))}
          </div>
          <div className="mt-4">
             <Button variant="secondary" className="w-full" onClick={() => setIsBatchListOpen(false)}>Đóng</Button>
          </div>
      </Modal>

    </div>
  );
}