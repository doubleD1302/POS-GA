import React, { useEffect, useState } from 'react';
import { db } from '../services/db';
import { Batch, Product, StockMovement } from '../types';
import { Button, Modal, Input, SecureValue } from '../components/ui';
import { formatCurrency, formatDate } from '../constants';

export default function Inventory() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  
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
  const [newAdjustmentInfo, setNewAdjustmentInfo] = useState<{pid: string, gender: string, title: string} | null>(null);
  const [candidateBatches, setCandidateBatches] = useState<Batch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [activeHistoryDate, setActiveHistoryDate] = useState<string>('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setProducts(db.getProducts());
    setBatches(db.getBatches());
    setStockMovements(db.getStockMovements(200));
  };

  const today = new Date().toISOString().split('T')[0];
  const todayMovements = stockMovements.filter(m => m.occurredAt.startsWith(today));
  const todayDeltaKg = todayMovements.reduce((sum, m) => sum + m.deltaKg, 0);
  const todayDeltaCon = todayMovements.reduce((sum, m) => sum + m.deltaCon, 0);
  const historyDates = Array.from(new Set(stockMovements.map(m => m.occurredAt.split('T')[0]).filter(Boolean))).sort((a, b) => b.localeCompare(a));
  const effectiveHistoryDate = activeHistoryDate || historyDates[0] || '';
  const historyByActiveDate = stockMovements.filter(m => m.occurredAt.startsWith(effectiveHistoryDate));

  useEffect(() => {
    if (!historyDates.length) {
      if (activeHistoryDate) setActiveHistoryDate('');
      return;
    }

    if (!activeHistoryDate || !historyDates.includes(activeHistoryDate)) {
      setActiveHistoryDate(historyDates[0]);
    }
  }, [stockMovements]);

  const movementSourceLabel = (source: StockMovement['source']) => {
    if (source === 'IMPORT') return 'Nhập hàng';
    if (source === 'SALE') return 'Xuất bán';
    if (source === 'ADJUSTMENT') return 'Điều chỉnh';
    return 'Sửa tay';
  };

  const formatMovementTime = (iso: string) => {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return iso;
    return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
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
    setSelectedBatchId(batch.id);
    setEditKg(batch.qtyRemKg.toString());
    setEditCon(batch.qtyRemCon.toString());
    setIsBatchModalOpen(true);
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
      const targetBatches = batches
      .filter(b => b.productId === pid && b.status === 'OPEN' && (b.gender === gender || !b.gender))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      if (targetBatches.length === 0) {
          if(window.confirm(`Chưa có lô hàng nào cho ${pName} (${gender === 'MALE' ? 'Trống' : 'Mái'}). Bạn muốn tạo tồn kho mới?`)) {
         setNewAdjustmentInfo({ pid, gender, title: `${pName} (${gender === 'MALE' ? 'Trống' : 'Mái'})` });
         setCandidateBatches([]);
             setEditingBatch(null);
             setEditKg('');
             setEditCon('');
         setSelectedBatchId('');
             setIsBatchModalOpen(true);
          }
          return;
      }

      setNewAdjustmentInfo({ pid, gender, title: `${pName} (${gender === 'MALE' ? 'Trống' : 'Mái'})` });
      setCandidateBatches(targetBatches);
      handleOpenBatchEdit(targetBatches[0]);
    }

    const handleBatchChangeInModal = (batchId: string) => {
    setSelectedBatchId(batchId);
    const nextBatch = candidateBatches.find(b => b.id === batchId);
    if (!nextBatch) return;
    setEditingBatch(nextBatch);
    setEditKg(nextBatch.qtyRemKg.toString());
    setEditCon(nextBatch.qtyRemCon.toString());
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

      {/* BIẾN ĐỘNG KHO HÔM NAY */}
      <div className="rounded-xl border border-brand-100 bg-white shadow-sm mb-4">
        <div className="px-4 py-3 border-b border-brand-100 bg-brand-50">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-bold text-brand-700">Biến động kho hôm nay</h2>
            <button
              onClick={() => setIsHistoryOpen(prev => !prev)}
              className="text-xs font-bold text-brand-700 hover:text-brand-900 px-2 py-1 rounded bg-white border border-brand-100"
            >
              {isHistoryOpen ? '▼ Lịch sử' : '▶ Lịch sử'}
            </button>
          </div>
          <div className="text-xs text-gray-600 mt-1">
            {todayMovements.length} giao dịch · Kg: <span className={`font-bold ${todayDeltaKg >= 0 ? 'text-green-600' : 'text-red-600'}`}>{todayDeltaKg >= 0 ? '+' : ''}{todayDeltaKg.toFixed(1)}</span> · Con: <span className={`font-bold ${todayDeltaCon >= 0 ? 'text-green-600' : 'text-red-600'}`}>{todayDeltaCon >= 0 ? '+' : ''}{todayDeltaCon}</span>
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
          {todayMovements.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">Hôm nay chưa có biến động kho.</div>
          ) : (
            todayMovements.slice(0, 15).map((movement) => (
              <div key={movement.id} className="px-4 py-2 text-sm grid grid-cols-12 gap-2 items-center">
                <div className="col-span-4 font-semibold text-gray-800 truncate">{movement.productName}</div>
                <div className="col-span-2 text-xs text-gray-500">{movement.gender === 'MALE' ? 'Trống' : 'Mái'}</div>
                <div className="col-span-3 text-xs text-gray-600">{movementSourceLabel(movement.source)}</div>
                <div className="col-span-2 text-right font-mono">
                  <span className={movement.deltaCon >= 0 ? 'text-green-600' : 'text-red-600'}>{movement.deltaCon >= 0 ? '+' : ''}{movement.deltaCon} con</span>
                </div>
                <div className="col-span-1 text-[11px] text-gray-400 text-right">{formatMovementTime(movement.occurredAt)}</div>
              </div>
            ))
          )}
        </div>

        {isHistoryOpen && (
          <div className="border-t border-gray-100 bg-gray-50">
            <div className="px-3 py-2 border-b border-gray-100">
              {historyDates.length === 0 ? (
                <div className="text-xs text-gray-500">Chưa có lịch sử biến động kho.</div>
              ) : (
                <div className="flex gap-2 overflow-x-auto no-scrollbar">
                  {historyDates.slice(0, 14).map((dateKey) => (
                    <button
                      key={dateKey}
                      onClick={() => setActiveHistoryDate(dateKey)}
                      className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold border ${effectiveHistoryDate === dateKey ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'}`}
                    >
                      {formatDate(dateKey)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="max-h-72 overflow-y-auto divide-y divide-gray-100 bg-white">
              {historyByActiveDate.length === 0 ? (
                <div className="p-4 text-sm text-gray-500">Không có dữ liệu trong ngày này.</div>
              ) : (
                historyByActiveDate.map((movement) => (
                  <div key={`history-${movement.id}`} className="px-4 py-2 grid grid-cols-12 gap-2 items-center text-sm">
                    <div className="col-span-4">
                      <div className="font-semibold text-gray-800 truncate">{movement.productName}</div>
                      <div className="text-[11px] text-gray-500">{movement.gender === 'MALE' ? 'Trống' : 'Mái'}</div>
                    </div>
                    <div className="col-span-3 text-xs text-gray-600">{movementSourceLabel(movement.source)}</div>
                    <div className="col-span-2 font-mono text-xs">
                      <span className={movement.deltaKg >= 0 ? 'text-green-600' : 'text-red-600'}>{movement.deltaKg >= 0 ? '+' : ''}{movement.deltaKg.toFixed(1)} kg</span>
                    </div>
                    <div className="col-span-2 font-mono text-xs text-right">
                      <span className={movement.deltaCon >= 0 ? 'text-green-600' : 'text-red-600'}>{movement.deltaCon >= 0 ? '+' : ''}{movement.deltaCon} con</span>
                    </div>
                    <div className="col-span-1 text-[11px] text-gray-400 text-right">{formatMovementTime(movement.occurredAt)}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
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
             <div className="col-span-2 text-xs font-bold text-blue-700 uppercase">Gà Trống (Đơn vị: nghìn VND/kg)</div>
             <Input label="Giá Nhập" type="number" value={costMale} onChange={(e: any) => setCostMale(e.target.value)} placeholder="VD: 50" />
             <Input label="Giá Bán" type="number" value={priceMale} onChange={(e: any) => setPriceMale(e.target.value)} placeholder="VD: 80" />
          </div>

          {/* Nhóm Gà Mái */}
           <div className="bg-pink-50 p-3 rounded border border-pink-100 grid grid-cols-2 gap-3">
             <div className="col-span-2 text-xs font-bold text-pink-600 uppercase">Gà Mái (Đơn vị: nghìn VND/kg)</div>
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
            {newAdjustmentInfo && (
              <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded p-2">
                Đang chỉnh: <span className="font-bold">{newAdjustmentInfo.title}</span>
              </div>
            )}
            {candidateBatches.length > 1 && (
              <div>
                <label className="text-sm font-bold text-gray-700 mb-1 block">Lô hàng</label>
                <select
                  value={selectedBatchId}
                  onChange={(e) => handleBatchChangeInModal(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {candidateBatches.map(b => (
                    <option key={b.id} value={b.id}>
                      {formatDate(b.date)} · {b.supplierName || 'Không rõ NCC'} · {b.qtyRemCon} con / {b.qtyRemKg.toFixed(1)} kg
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
                <Input label="Số Kg còn lại" type="number" value={editKg} onChange={(e: any) => setEditKg(e.target.value)} autoFocus />
                <Input label="Số Con còn lại" type="number" value={editCon} onChange={(e: any) => setEditCon(e.target.value)} />
            </div>
            <Button className="w-full" onClick={handleSaveBatch}>Cập nhật kho</Button>
         </div>
      </Modal>

    </div>
  );
}