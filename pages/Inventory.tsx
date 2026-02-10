import React, { useEffect, useState } from 'react';
import { db } from '../services/db';
import { Batch, Product, Gender  } from '../types';
import { Card, Button, Modal, Input, SecureValue } from '../components/ui';
import { formatCurrency, formatDate } from '../constants';

export default function Inventory() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [tab, setTab] = useState<'STOCK' | 'PRODUCTS'>('STOCK');

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

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setProducts(db.getProducts());
    setBatches(db.getBatches());
  };

  const handleOpenModal = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setFormName(product.name);
      // Load giá cũ, nếu chưa có thì để trống hoặc 0
      setPriceMale(product.priceMale?.toString() || '');
      setPriceFemale(product.priceFemale?.toString() || '');
      setCostMale(product.costMale?.toString() || '');
      setCostFemale(product.costFemale?.toString() || '');
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
      // Lưu cấu trúc mới
      priceMale: Number(priceMale) || 0,
      priceFemale: Number(priceFemale) || 0,
      costMale: Number(costMale) || 0,
      costFemale: Number(costFemale) || 0,
    };
    
    db.saveProduct(newProduct);
    loadData();
    setIsModalOpen(false);
  };

  const handleDeleteProduct = (id: string) => {
    if (window.confirm("Bạn có chắc chắn muốn xóa sản phẩm này?")) {
      db.deleteProduct(id);
      setTimeout(() => loadData(), 50);
    }
  };

  const handleOpenBatchEdit = (batch: Batch) => {
    setEditingBatch(batch);
    setEditKg(batch.qtyRemKg.toString());
    setEditCon(batch.qtyRemCon.toString());
    setIsBatchModalOpen(true);
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

  // Group by Product
  // Group by Product & Gender
  const inventoryByProduct = products.map(p => {
    const batchesOpen = batches.filter(b => b.productId === p.id && b.status === 'OPEN');
    
    // Tách batch theo giới tính (Lưu ý: batch cũ không có gender sẽ tính vào MALE hoặc list riêng, ở đây ta gộp vào MALE để an toàn)
    const maleBatches = batchesOpen.filter(b => b.gender === 'MALE' || !b.gender);
    const femaleBatches = batchesOpen.filter(b => b.gender === 'FEMALE');

    return {
      product: p,
      male: {
          kg: maleBatches.reduce((acc, b) => acc + b.qtyRemKg, 0),
          con: maleBatches.reduce((acc, b) => acc + b.qtyRemCon, 0),
          batches: maleBatches
      },
      female: {
          kg: femaleBatches.reduce((acc, b) => acc + b.qtyRemKg, 0),
          con: femaleBatches.reduce((acc, b) => acc + b.qtyRemCon, 0),
          batches: femaleBatches
      }
    };
  });;

  return (
    <div className="pb-20">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold text-brand-600">Quản Lý Kho</h1>
        {tab === 'PRODUCTS' && (
          <Button onClick={() => handleOpenModal()} className="text-sm px-3 py-1">+ Thêm Gà</Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex bg-white rounded-lg p-1 shadow-sm border border-gray-100 mb-4">
        <button 
          onClick={() => setTab('STOCK')}
          className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${tab === 'STOCK' ? 'bg-brand-50 text-brand-600' : 'text-gray-500'}`}
        >
          Tồn Kho
        </button>
        <button 
          onClick={() => setTab('PRODUCTS')}
          className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${tab === 'PRODUCTS' ? 'bg-brand-50 text-brand-600' : 'text-gray-500'}`}
        >
          Danh Mục
        </button>
      </div>
      
      {tab === 'STOCK' ? (
        <div className="space-y-6">
          {inventoryByProduct.map((item, index) => (
            <Card 
              key={item.product.id} 
              className={`overflow-hidden transition-colors ${index % 2 === 0 ? 'bg-white border-gray-200' : 'bg-gray-100 border-gray-300'}`}>
              <div className="border-b border-gray-100 pb-2 mb-2 flex justify-between items-center">
                  <h3 className="font-bold text-lg text-gray-800">{item.product.name}</h3>
                  <button onClick={() => handleOpenModal(item.product)} className="text-xs text-blue-600 underline">Cài đặt giá</button>
              </div>

              {/* Grid 2 Cột: Trống - Mái */}
              <div className="grid grid-cols-2 gap-0 divide-x divide-gray-200">
                
                {/* CỘT GÀ TRỐNG */}
                <div className="pr-2">
                    <div className="text-center bg-blue-50 text-blue-700 text-xs font-bold uppercase py-1 rounded mb-2">Trống</div>
                    <div className="text-right mb-2">
                        <span className="text-2xl font-black text-gray-800 leading-none">{item.male.con}</span> <span className="text-xs text-gray-500">con</span>
                        <div className="text-sm font-medium text-gray-400">{item.male.kg.toFixed(1)} kg</div>
                    </div>
                    {/* List Batch Trống (Đã ẩn Vốn) */}
                    <div className="space-y-1">
                        {item.male.batches.map(batch => (
                            <div key={batch.id} onClick={() => handleOpenBatchEdit(batch)} className="bg-gray-50 p-1.5 rounded border-l-2 border-blue-400 text-[10px] cursor-pointer hover:bg-gray-100 flex justify-between">
                                <span className="text-gray-600">{formatDate(batch.date)}</span>
                                <span className="font-bold text-gray-800">{batch.qtyRemCon}c / {batch.qtyRemKg.toFixed(1)}kg</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* CỘT GÀ MÁI */}
                <div className="pl-2">
                    <div className="text-center bg-pink-50 text-pink-600 text-xs font-bold uppercase py-1 rounded mb-2">Mái</div>
                    <div className="text-right mb-2">
                        <span className="text-2xl font-black text-gray-800 leading-none">{item.female.con}</span> <span className="text-xs text-gray-500">con</span>
                        <div className="text-sm font-medium text-gray-400">{item.female.kg.toFixed(1)} kg</div>
                    </div>
                     {/* List Batch Mái (Đã ẩn Vốn) */}
                    <div className="space-y-1">
                        {item.female.batches.map(batch => (
                            <div key={batch.id} onClick={() => handleOpenBatchEdit(batch)} className="bg-gray-50 p-1.5 rounded border-l-2 border-pink-400 text-[10px] cursor-pointer hover:bg-gray-100 flex justify-between">
                                <span className="text-gray-600">{formatDate(batch.date)}</span>
                                <span className="font-bold text-gray-800">{batch.qtyRemCon}c / {batch.qtyRemKg.toFixed(1)}kg</span>
                            </div>
                        ))}
                    </div>
                </div>

              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
           {products.map(p => (
             <Card key={p.id} className="flex justify-between items-center">
               <div>
                 <div className="font-bold text-gray-800 text-lg">{p.name}</div>
                 <div className="text-sm text-gray-600 flex gap-4 mt-1">
                    <span>Bán: <b className="text-blue-600">{formatCurrency(p.defaultPrice)}</b></span>
                    <span className="flex items-center gap-1">
                      Nhập: 
                        <b className="text-orange-600">
                        {p.standardCost ? <SecureValue value={formatCurrency(p.standardCost)} /> : '_'}
                       </b>
                    </span>
                  </div>
                  </div>
               <div className="flex gap-2">
                 <button onClick={() => handleOpenModal(p)} className="p-2 text-blue-600 bg-blue-50 rounded hover:bg-blue-100">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                 </button>
                 <button onClick={() => handleDeleteProduct(p.id)} className="p-2 text-red-600 bg-red-50 rounded hover:bg-red-100">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                 </button>
               </div>
             </Card>
           ))}
        </div>
      )}

      {/* Add/Edit Product Modal - GIAO DIỆN MỚI */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        title={editingProduct ? "Sửa Sản Phẩm" : "Thêm Sản Phẩm"}
      >
        <div className="space-y-4">
          <Input label="Tên loại gà" value={formName} onChange={(e: any) => setFormName(e.target.value)} placeholder="Ví dụ: Gà mía" />
          
          {/* Nhóm Gà Trống */}
          <div className="bg-blue-50 p-3 rounded border border-blue-100 grid grid-cols-2 gap-3">
             <div className="col-span-2 text-xs font-bold text-blue-700 uppercase">Gà Trống (Male)</div>
             <Input label="Giá Nhập" type="number" value={costMale} onChange={(e: any) => setCostMale(e.target.value)} />
             <Input label="Giá Bán" type="number" value={priceMale} onChange={(e: any) => setPriceMale(e.target.value)} />
          </div>

          {/* Nhóm Gà Mái */}
           <div className="bg-pink-50 p-3 rounded border border-pink-100 grid grid-cols-2 gap-3">
             <div className="col-span-2 text-xs font-bold text-pink-600 uppercase">Gà Mái (Female)</div>
             <Input label="Giá Nhập" type="number" value={costFemale} onChange={(e: any) => setCostFemale(e.target.value)} />
             <Input label="Giá Bán" type="number" value={priceFemale} onChange={(e: any) => setPriceFemale(e.target.value)} />
          </div>

          <p className="text-xs text-gray-500 italic">* Giá nhập sẽ tự động cập nhật khi bạn tạo phiếu nhập hàng mới.</p>
          <Button className="w-full" onClick={handleSaveProduct}>Lưu lại</Button>
        </div>
      </Modal>

      {/* Edit Batch Modal */}
      <Modal isOpen={isBatchModalOpen} onClose={() => setIsBatchModalOpen(false)} title="Sửa Tồn Kho">
         <div className="space-y-4">
            <p className="text-sm text-yellow-600 bg-yellow-50 p-2 rounded">Điều chỉnh thủ công số lượng còn lại của lô này.</p>
            <div className="grid grid-cols-2 gap-4">
                <Input label="Số Kg còn" type="number" value={editKg} onChange={(e: any) => setEditKg(e.target.value)} />
                <Input label="Số Con còn" type="number" value={editCon} onChange={(e: any) => setEditCon(e.target.value)} />
            </div>
            <Button className="w-full" onClick={handleSaveBatch}>Cập nhật kho</Button>
         </div>
      </Modal>
    </div>
  );
}