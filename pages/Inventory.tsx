import React, { useEffect, useState } from 'react';
import { db } from '../services/db';
import { Batch, Product, Gender  } from '../types';
import { Card, Button, Modal, Input, SecureValue } from '../components/ui';
import { formatCurrency, formatDate } from '../constants';

export default function Inventory() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [tab, setTab] = useState<'STOCK' | 'PRODUCTS'>('PRODUCTS'); // Mặc định vào tab Danh mục để quản lý

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

  // Batch List Modal (Khi sửa kho từ danh mục)
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
    // Đóng modal danh sách nếu đang mở
    setIsBatchListOpen(false);
  }

  const handleSaveBatch = () => {
    if (!editingBatch) return;
    const kg = parseFloat(editKg);
    const con = parseInt(editCon);
    if (isNaN(kg) || isNaN(con)) return alert("Số liệu không hợp lệ");

    db.updateBatch(editingBatch.id, { qtyRemKg: kg, qtyRemCon: con });
    loadData();
    setIsBatchModalOpen(false);
  }

  // Hàm mở danh sách batch để sửa từ tab Danh mục
  const handleEditStockFromCategory = (pid: string, gender: 'MALE' | 'FEMALE', pName: string) => {
      const targetBatches = batches.filter(b => b.productId === pid && b.status === 'OPEN' && (b.gender === gender || !b.gender));
      
      if (targetBatches.length === 0) {
          alert("Hiện không có lô hàng nào còn tồn để sửa!");
          return;
      }

      // Nếu chỉ có 1 lô, mở luôn sửa lô đó cho nhanh
      if (targetBatches.length === 1) {
          handleOpenBatchEdit(targetBatches[0]);
      } else {
          // Nếu nhiều lô, hiện danh sách để chọn
          setSelectedBatchesForEdit(targetBatches);
          setSelectedProductTitle(`${pName} (${gender === 'MALE' ? 'Trống' : 'Mái'})`);
          setIsBatchListOpen(true);
      }
  }

  // Helper tính tồn kho
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

  return (
    <div className="pb-24">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold text-brand-600">Quản Lý Kho</h1>
        {tab === 'PRODUCTS' && (
          <Button onClick={() => handleOpenModal()} className="text-sm px-3 py-1">+ Thêm Gà</Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex bg-white rounded-lg p-1 shadow-sm border border-gray-100 mb-4">
        <button 
          onClick={() => setTab('PRODUCTS')}
          className={`flex-1 py-2 text-sm font-bold uppercase rounded-md transition-all ${tab === 'PRODUCTS' ? 'bg-brand-600 text-white shadow' : 'text-gray-500 hover:bg-gray-50'}`}
        >
          Danh Mục & Giá
        </button>
        <button 
          onClick={() => setTab('STOCK')}
          className={`flex-1 py-2 text-sm font-bold uppercase rounded-md transition-all ${tab === 'STOCK' ? 'bg-brand-600 text-white shadow' : 'text-gray-500 hover:bg-gray-50'}`}
        >
          Lịch sử nhập
        </button>
      </div>
      
      {tab === 'PRODUCTS' ? (
        <div className="space-y-4">
           {products.map((p, index) => {
             const stock = getStock(p.id);
             const cardBg = index % 2 === 0 ? 'bg-white' : 'bg-slate-50 shadow-inner';
             return (
             <Card key={p.id} className={`overflow-hidden border-l-4 border-l-brand-500 ${cardBg}`}>
               {/* Header Tên Gà + Hành động */}
               <div className="flex justify-between items-center border-b border-gray-100 pb-2 mb-2">
                  <h3 className="font-bold text-lg text-gray-800 uppercase">{p.name}</h3>
                  <div className="flex gap-2">
                    <button onClick={() => handleOpenModal(p)} className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded hover:bg-blue-100">
                        Cài đặt
                    </button>
                    <button onClick={() => handleDeleteProduct(p.id)} className="text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded hover:bg-red-100">
                        Xóa
                    </button>
                  </div>
               </div>

               {/* Grid thông tin chi tiết: Trống vs Mái */}
               <div className="grid grid-cols-2 gap-0 divide-x divide-gray-200">
                  
                  {/* CỘT GÀ TRỐNG */}
                  <div className="pr-2">
                      <div className="text-center bg-blue-100 text-blue-800 text-[10px] font-black uppercase py-1 rounded mb-2">Gà Trống</div>
                      
                      {/* Giá */}
                      <div className="space-y-1 mb-3 text-sm">
                          <div className="flex justify-between">
                              <span className="text-gray-500 text-xs">Giá Nhập:</span>
                              <span className="font-bold text-orange-600">{p.costMale ? <SecureValue value={formatCurrency(p.costMale)} /> : '_'}</span>
                          </div>
                          <div className="flex justify-between">
                              <span className="text-gray-500 text-xs">Giá Bán:</span>
                              <span className="font-bold text-blue-600">{formatCurrency(p.priceMale)}</span>
                          </div>
                      </div>

                      {/* Tồn kho & Sửa */}
                      <div className="bg-gray-50 p-2 rounded border border-gray-200">
                          <div className="text-[10px] text-gray-400 font-bold uppercase mb-1">Tồn kho hiện tại</div>
                          <div className="flex justify-between items-center">
                              <div className="leading-tight">
                                  <div className="font-black text-gray-800 text-lg">{stock.male.con} <span className="text-[10px] font-normal text-gray-500">con</span></div>
                                  <div className="text-xs text-gray-500 font-medium">{stock.male.kg.toFixed(1)} kg</div>
                              </div>
                              <button onClick={() => handleEditStockFromCategory(p.id, 'MALE', p.name)} className="bg-white border border-gray-300 shadow-sm p-1.5 rounded-full text-gray-600 hover:text-brand-600 active:scale-95">
                                 ✏️
                              </button>
                          </div>
                      </div>
                  </div>

                  {/* CỘT GÀ MÁI */}
                  <div className="pl-2">
                      <div className="text-center bg-pink-100 text-pink-800 text-[10px] font-black uppercase py-1 rounded mb-2">Gà Mái </div>
                      
                      {/* Giá */}
                      <div className="space-y-1 mb-3 text-sm">
                          <div className="flex justify-between">
                              <span className="text-gray-500 text-xs">Giá Nhập:</span>
                              <span className="font-bold text-orange-600">{p.costFemale ? <SecureValue value={formatCurrency(p.costFemale)} /> : '_'}</span>
                          </div>
                          <div className="flex justify-between">
                              <span className="text-gray-500 text-xs">Giá Bán:</span>
                              <span className="font-bold text-pink-600">{formatCurrency(p.priceFemale)}</span>
                          </div>
                      </div>

                       {/* Tồn kho & Sửa */}
                       <div className="bg-gray-50 p-2 rounded border border-gray-200">
                          <div className="text-[10px] text-gray-400 font-bold uppercase mb-1">Tồn kho hiện tại</div>
                          <div className="flex justify-between items-center">
                              <div className="leading-tight">
                                  <div className="font-black text-gray-800 text-lg">{stock.female.con} <span className="text-[10px] font-normal text-gray-500">con</span></div>
                                  <div className="text-xs text-gray-500 font-medium">{stock.female.kg.toFixed(1)} kg</div>
                              </div>
                              <button onClick={() => handleEditStockFromCategory(p.id, 'FEMALE', p.name)} className="bg-white border border-gray-300 shadow-sm p-1.5 rounded-full text-gray-600 hover:text-brand-600 active:scale-95">
                                 ✏️
                              </button>
                          </div>
                      </div>
                  </div>

               </div>
             </Card>
           )})}
        </div>
      ) : (
        // TAB STOCK (GIỮ NGUYÊN HOẶC ĐƠN GIẢN HOÁ VÌ ĐÃ CÓ Ở TAB KIA)
        <div className="space-y-4">
             <div className="text-center text-xs text-gray-500 italic bg-yellow-50 p-2 rounded">
                 Tab này hiển thị chi tiết các lô hàng (Batches) đang có trong kho.
             </div>
             {batches.filter(b => b.status === 'OPEN').map(batch => (
                 <div key={batch.id} onClick={() => handleOpenBatchEdit(batch)} className="bg-white p-3 rounded-lg shadow-sm border border-gray-200 cursor-pointer hover:border-brand-300 flex justify-between items-center">
                    <div>
                        <div className="font-bold text-gray-800 text-sm">
                            {products.find(p => p.id === batch.productId)?.name || 'Unknown'} 
                            <span className={`ml-1 text-[10px] px-1 rounded ${batch.gender === 'FEMALE' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'}`}>{batch.gender === 'FEMALE' ? 'Mái' : 'Trống'}</span>
                        </div>
                        <div className="text-xs text-gray-500">{formatDate(batch.date)} • {batch.supplierName}</div>
                    </div>
                    <div className="text-right">
                        <div className="font-bold text-gray-800">{batch.qtyRemCon} con</div>
                        <div className="text-xs text-gray-500">{batch.qtyRemKg.toFixed(1)} kg</div>
                    </div>
                 </div>
             ))}
        </div>
      )}

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
             <Input label="Giá Nhập" type="number" value={costMale} onChange={(e: any) => setCostMale(e.target.value)} placeholder="VD: 50 hoặc 50.5" />
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
               Bạn đang sửa số lượng thực tế của lô hàng nhập ngày <b>{editingBatch && formatDate(editingBatch.date)}</b>.
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