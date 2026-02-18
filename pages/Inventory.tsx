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
  const historyDates: string[] = Array.from(
    new Set(stockMovements.map(m => m.occurredAt.split('T')[0]).filter(Boolean))
  ) as string[];
  historyDates.sort((a, b) => b.localeCompare(a));
  const effectiveHistoryDate = activeHistoryDate || historyDates[0] || '';
  const historyByActiveDate = stockMovements.filter(m => m.occurredAt.startsWith(effectiveHistoryDate));

  const summarizeMovements = (movements: StockMovement[]) => {
    let totalIncreaseCon = 0;
    let totalDecreaseCon = 0;
    let totalIncreaseKg = 0;
    let totalDecreaseKg = 0;
    const increaseByProduct: Record<string, number> = {};
    const decreaseByProduct: Record<string, number> = {};

    movements.forEach((movement) => {
      const productKey = `${movement.productName || 'Không rõ loại gà'} (${movement.gender === 'FEMALE' ? 'Mái' : 'Trống'})`;

      if (movement.deltaCon > 0) {
        totalIncreaseCon += movement.deltaCon;
        increaseByProduct[productKey] = (increaseByProduct[productKey] || 0) + movement.deltaCon;
      } else if (movement.deltaCon < 0) {
        const absCon = Math.abs(movement.deltaCon);
        totalDecreaseCon += absCon;
        decreaseByProduct[productKey] = (decreaseByProduct[productKey] || 0) + absCon;
      }

      if (movement.deltaKg > 0) totalIncreaseKg += movement.deltaKg;
      else if (movement.deltaKg < 0) totalDecreaseKg += Math.abs(movement.deltaKg);
    });

    const toSortedEntries = (source: Record<string, number>) =>
      Object.entries(source).sort((a, b) => b[1] - a[1]);

    return {
      totalIncreaseCon,
      totalDecreaseCon,
      totalIncreaseKg,
      totalDecreaseKg,
      increaseByProduct: toSortedEntries(increaseByProduct),
      decreaseByProduct: toSortedEntries(decreaseByProduct),
      txCount: movements.length,
    };
  };

  const todaySummary = summarizeMovements(todayMovements);
  const historySummary = summarizeMovements(historyByActiveDate);

  useEffect(() => {
    if (!historyDates.length) {
      if (activeHistoryDate) setActiveHistoryDate('');
      return;
    }

    if (!activeHistoryDate || !historyDates.includes(activeHistoryDate)) {
      setActiveHistoryDate(historyDates[0]);
    }
  }, [stockMovements]);

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
    if (window.confirm("Xóa sản phẩm này sẽ không xóa lịch sử nhập/xuất cũ. Tiếp tục?")) {
      db.deleteProduct(id);
      setTimeout(() => loadData(), 50);
    }
  };

  // --- LOGIC SỬA KHO (THEO LOẠI GÀ) ---
  const handleOpenBatchEdit = (batch: Batch) => {
    setEditingBatch(batch);
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
      const targetStock = batches.find(b => b.productId === pid && (b.gender === gender || !b.gender));

      setNewAdjustmentInfo({ pid, gender, title: `${pName} (${gender === 'MALE' ? 'Trống' : 'Mái'})` });
      if (targetStock) {
        handleOpenBatchEdit(targetStock);
        return;
      }

      setEditingBatch(null);
      setEditKg('0');
      setEditCon('0');
      setIsBatchModalOpen(true);
  }

  const getStock = (pid: string) => {
      const prodStocks = batches.filter(b => b.productId === pid);
      const male = prodStocks.filter(b => b.gender === 'MALE' || !b.gender);
      const female = prodStocks.filter(b => b.gender === 'FEMALE');

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
            {todaySummary.txCount} giao dịch · Tăng: <span className="font-bold text-green-600">+{todaySummary.totalIncreaseCon} con</span> · Giảm: <span className="font-bold text-red-600">-{todaySummary.totalDecreaseCon} con</span>
          </div>
        </div>
        <div className="p-3 bg-white">
          {todaySummary.txCount === 0 ? (
            <div className="p-2 text-sm text-gray-500">Hôm nay chưa có biến động kho.</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="bg-green-50 border border-green-100 rounded-lg p-2">
                  <div className="text-[11px] font-bold text-green-700 uppercase">Tổng tăng</div>
                  <div className="text-lg font-black text-green-600">+{todaySummary.totalIncreaseCon} con</div>
                  <div className="text-[11px] text-green-700">{todaySummary.totalIncreaseKg.toFixed(1)} kg</div>
                </div>
                <div className="bg-red-50 border border-red-100 rounded-lg p-2">
                  <div className="text-[11px] font-bold text-red-700 uppercase">Tổng giảm</div>
                  <div className="text-lg font-black text-red-600">-{todaySummary.totalDecreaseCon} con</div>
                  <div className="text-[11px] text-red-700">{todaySummary.totalDecreaseKg.toFixed(1)} kg</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="border border-green-100 rounded-lg overflow-hidden">
                  <div className="bg-green-50 px-3 py-2 text-xs font-bold text-green-700 uppercase">Loại gà tăng (con)</div>
                  <div className="max-h-40 overflow-y-auto divide-y divide-green-50">
                    {todaySummary.increaseByProduct.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-gray-500">Không có loại gà tăng.</div>
                    ) : todaySummary.increaseByProduct.map(([product, qty]) => (
                      <div key={`inc-${product}`} className="px-3 py-2 text-sm flex justify-between items-center">
                        <span className="text-gray-700 truncate pr-2">{product}</span>
                        <span className="font-bold text-green-600">+{qty}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border border-red-100 rounded-lg overflow-hidden">
                  <div className="bg-red-50 px-3 py-2 text-xs font-bold text-red-700 uppercase">Loại gà giảm (con)</div>
                  <div className="max-h-40 overflow-y-auto divide-y divide-red-50">
                    {todaySummary.decreaseByProduct.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-gray-500">Không có loại gà giảm.</div>
                    ) : todaySummary.decreaseByProduct.map(([product, qty]) => (
                      <div key={`dec-${product}`} className="px-3 py-2 text-sm flex justify-between items-center">
                        <span className="text-gray-700 truncate pr-2">{product}</span>
                        <span className="font-bold text-red-600">-{qty}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
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

            <div className="p-3 bg-white">
              {historySummary.txCount === 0 ? (
                <div className="p-2 text-sm text-gray-500">Không có dữ liệu trong ngày này.</div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="bg-green-50 border border-green-100 rounded-lg p-2">
                      <div className="text-[11px] font-bold text-green-700 uppercase">Tổng tăng</div>
                      <div className="text-lg font-black text-green-600">+{historySummary.totalIncreaseCon} con</div>
                      <div className="text-[11px] text-green-700">{historySummary.totalIncreaseKg.toFixed(1)} kg</div>
                    </div>
                    <div className="bg-red-50 border border-red-100 rounded-lg p-2">
                      <div className="text-[11px] font-bold text-red-700 uppercase">Tổng giảm</div>
                      <div className="text-lg font-black text-red-600">-{historySummary.totalDecreaseCon} con</div>
                      <div className="text-[11px] text-red-700">{historySummary.totalDecreaseKg.toFixed(1)} kg</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="border border-green-100 rounded-lg overflow-hidden">
                      <div className="bg-green-50 px-3 py-2 text-xs font-bold text-green-700 uppercase">Loại gà tăng (con)</div>
                      <div className="max-h-40 overflow-y-auto divide-y divide-green-50">
                        {historySummary.increaseByProduct.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-gray-500">Không có loại gà tăng.</div>
                        ) : historySummary.increaseByProduct.map(([product, qty]) => (
                          <div key={`history-inc-${product}`} className="px-3 py-2 text-sm flex justify-between items-center">
                            <span className="text-gray-700 truncate pr-2">{product}</span>
                            <span className="font-bold text-green-600">+{qty}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="border border-red-100 rounded-lg overflow-hidden">
                      <div className="bg-red-50 px-3 py-2 text-xs font-bold text-red-700 uppercase">Loại gà giảm (con)</div>
                      <div className="max-h-40 overflow-y-auto divide-y divide-red-50">
                        {historySummary.decreaseByProduct.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-gray-500">Không có loại gà giảm.</div>
                        ) : historySummary.decreaseByProduct.map(([product, qty]) => (
                          <div key={`history-dec-${product}`} className="px-3 py-2 text-sm flex justify-between items-center">
                            <span className="text-gray-700 truncate pr-2">{product}</span>
                            <span className="font-bold text-red-600">-{qty}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
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

          <p className="text-xs text-gray-500 italic">* Giá nhập này dùng để gợi ý khi nhập hàng. Giá vốn sẽ được quản lý chung theo loại gà.</p>
          <Button className="w-full" onClick={handleSaveProduct}>Lưu lại</Button>
        </div>
      </Modal>

      {/* MODAL 2: Sửa tồn theo loại gà */}
      <Modal isOpen={isBatchModalOpen} onClose={() => setIsBatchModalOpen(false)} title="Sửa Tồn Kho (Theo Loại Gà)">
         <div className="space-y-4">
            <div className="bg-yellow-50 p-2 rounded text-xs text-yellow-700 border border-yellow-200">
               Điều chỉnh số lượng thực tế theo loại gà (không tách lô hàng).
            </div>
            {newAdjustmentInfo && (
              <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded p-2">
                Đang chỉnh: <span className="font-bold">{newAdjustmentInfo.title}</span>
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