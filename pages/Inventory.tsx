import React, { useEffect, useState } from 'react';
import { db } from '../services/db';
import { Batch, Product } from '../types';
import { Card, Button, Modal, Input } from '../components/ui';
import { formatCurrency, formatDate } from '../constants';

export default function Inventory() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [tab, setTab] = useState<'STOCK' | 'PRODUCTS'>('STOCK');

  // Product Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formName, setFormName] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formCost, setFormCost] = useState(''); 

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
      setFormPrice(product.defaultPrice.toString());
      setFormCost(product.standardCost?.toString() || '');
    } else {
      setEditingProduct(null);
      setFormName('');
      setFormPrice('');
      setFormCost('');
    }
    setIsModalOpen(true);
  };

  const handleSaveProduct = () => {
    if (!formName || !formPrice) return alert("Vui lòng điền đủ thông tin");
    
    const newProduct: Product = {
      id: editingProduct ? editingProduct.id : `p-${Date.now()}`,
      name: formName,
      defaultPrice: Number(formPrice),
      standardCost: formCost ? Number(formCost) : undefined
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
  const inventoryByProduct = products.map(p => {
    const productBatches = batches.filter(b => b.productId === p.id && b.status === 'OPEN');
    const totalKg = productBatches.reduce((acc, b) => acc + b.qtyRemKg, 0);
    const totalCon = productBatches.reduce((acc, b) => acc + b.qtyRemCon, 0);
    
    return {
      product: p,
      batches: productBatches,
      totalKg,
      totalCon,
    };
  });

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
          {inventoryByProduct.map((item) => (
            <Card key={item.product.id} className="overflow-hidden">
              <div className="flex justify-between items-start border-b border-gray-100 pb-2 mb-2">
                <div>
                  <h3 className="font-bold text-lg text-gray-800">{item.product.name}</h3>
                </div>
                <div className="text-right">
                  <div className="font-bold text-brand-600">{item.totalKg.toFixed(1)} kg</div>
                  <div className="text-sm text-gray-600">{item.totalCon} con</div>
                </div>
              </div>

              {/* Batch List */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-gray-400 uppercase">Các lô còn hàng (FIFO)</h4>
                {item.batches.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">Hết hàng</p>
                ) : (
                  item.batches.map(batch => (
                    <div key={batch.id} className="bg-gray-50 p-2 rounded flex justify-between items-center text-sm border-l-4 border-brand-200">
                      <div>
                        <div className="font-medium text-gray-700">{formatDate(batch.date)}</div>
                        {batch.supplierName && (
                          <div className="text-xs text-gray-500 italic mb-1">{batch.supplierName}</div>
                        )}
                        <div className="text-xs text-brand-600 font-bold bg-brand-50 inline-block px-1 rounded">
                          Vốn: {formatCurrency(batch.costPerKg)}/kg
                        </div>
                      </div>
                      <div className="text-right">
                         <div className="text-gray-900 font-medium">{batch.qtyRemKg.toFixed(1)} kg</div>
                         <div className="text-xs text-gray-500">({batch.qtyRemCon} con)</div>
                         <button onClick={() => handleOpenBatchEdit(batch)} className="text-[10px] text-blue-600 underline mt-1">Sửa tồn</button>
                      </div>
                    </div>
                  ))
                )}
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
                    <span>Nhập: <b className="text-orange-600">{p.standardCost ? formatCurrency(p.standardCost) : '_'}</b></span>
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

      {/* Add/Edit Product Modal */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        title={editingProduct ? "Sửa Sản Phẩm" : "Thêm Sản Phẩm"}
      >
        <div className="space-y-4">
          <Input label="Tên loại gà" value={formName} onChange={(e: any) => setFormName(e.target.value)} placeholder="Ví dụ: Gà mía" />
          <div className="grid grid-cols-2 gap-4">
             <Input label="Giá bán (mặc định)" type="number" value={formPrice} onChange={(e: any) => setFormPrice(e.target.value)} />
             <Input label="Giá nhập" type="number" value={formCost} onChange={(e: any) => setFormCost(e.target.value)} placeholder="Tự động cập nhật" />
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