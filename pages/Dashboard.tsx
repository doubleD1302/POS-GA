import React, { useEffect, useState } from 'react';
import { db } from '../services/db';
import { DashboardStats } from '../types';
import { formatCurrency, ICONS } from '../constants';
import { StatCard, Button, Card, Input, Select } from '../components/ui';

export default function Dashboard({ navigate, onLogout }: { navigate: (page: string) => void, onLogout: () => void }) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isSalesExpanded, setIsSalesExpanded] = useState(false);
  const [isSalesUnlocked, setIsSalesUnlocked] = useState(false);
  const [isExpenseExpanded, setIsExpenseExpanded] = useState(false);
  const [otherExpenseCategory, setOtherExpenseCategory] = useState('Cám');
  const [otherExpenseAmount, setOtherExpenseAmount] = useState('');
  const [otherExpenseNote, setOtherExpenseNote] = useState('');
  const [isSavingExpense, setIsSavingExpense] = useState(false);

  const refreshStats = () => {
    const data = db.getDashboardStats();
    setStats(data);
  };

  useEffect(() => {
    refreshStats();
  }, []);

  if (!stats) return <div className="p-4">Đang tải...</div>;

  const handleSalesSecurityToggle = () => {
    if (isSalesUnlocked) {
      setIsSalesUnlocked(false);
      setIsSalesExpanded(false);
      return;
    }

    const currentCode = localStorage.getItem('gttd_current_business_id');
    const inputCode = window.prompt('🔒 Nhập Mã Doanh Nghiệp để mở chi tiết doanh số:');

    if (inputCode === currentCode) {
      setIsSalesUnlocked(true);
      setIsSalesExpanded(true);
      return;
    }

    if (inputCode !== null) {
      alert('❌ Mã không đúng. Không thể mở chi tiết doanh số.');
    }
  };

  const handleSalesMenuClick = () => {
    if (!isSalesUnlocked) {
      handleSalesSecurityToggle();
      return;
    }
    setIsSalesExpanded(prev => !prev);
  };

  const handleCreateOtherExpense = async () => {
    const amount = Number(otherExpenseAmount);
    if (!amount || amount <= 0) {
      alert('Vui lòng nhập số tiền chi hợp lệ');
      return;
    }

    setIsSavingExpense(true);
    try {
      await db.createOtherExpense(amount, otherExpenseCategory, otherExpenseNote);
      setOtherExpenseAmount('');
      setOtherExpenseNote('');
      refreshStats();
      alert('Đã ghi nhận khoản chi');
    } catch (e: any) {
      alert(e.message || 'Không thể lưu khoản chi');
    } finally {
      setIsSavingExpense(false);
    }
  };

  return (
    <div className="space-y-4 pb-20">
      <header className="flex justify-between items-start mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Tổng quan</h1>
          <p className="text-sm text-gray-500">{new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>

        <button
          onClick={onLogout}
          className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 transition-colors"
        >
          Đổi TK ↻
        </button>
      </header>

      <Card className="p-0 overflow-hidden">
        <div className="p-4 flex items-center justify-between gap-3">
          <button onClick={handleSalesMenuClick} className="flex-1 text-left hover:opacity-90 transition-opacity">
            <div>
              <h3 className="text-base font-bold text-gray-800">Quản lý doanh số</h3>
              <p className="text-xs text-gray-500 mt-1">
                {!isSalesUnlocked ? 'Nhấn để nhập mã và mở bảng chỉ số' : isSalesExpanded ? 'Đang mở chi tiết. Nhấn lại để thu gọn.' : 'Đã mở khoá. Nhấn để xem lại chi tiết.'}
              </p>
            </div>
          </button>
          <button
            onClick={handleSalesSecurityToggle}
            className={`text-xs font-bold px-2 py-1 rounded border ${isSalesUnlocked ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}
          >
            {isSalesUnlocked ? '🔓 Khoá lại' : '🔒 Mở khoá'}
          </button>
        </div>

        {isSalesExpanded && isSalesUnlocked && (
          <div className="border-t border-gray-100 p-4 space-y-3 bg-gray-50">
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Lãi gộp hôm nay" value={formatCurrency(stats.profitToday)} color={stats.profitToday >= 0 ? "text-green-600" : "text-red-600"} subtext="Thực thu - Vốn hàng" />
              <StatCard label="Doanh thu (Thực thu)" value={formatCurrency(stats.revenueToday)} color="text-green-600" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Khách nợ (Phải thu)" value={formatCurrency(stats.receivables)} color="text-orange-500" />
              <StatCard label="Vốn nhập gà (Tổng)" value={formatCurrency(stats.importCapital)} color="text-blue-600" subtext="Tổng vốn đã bỏ ra" />
            </div>
          </div>
        )}
      </Card>

      <Card className="p-0 overflow-hidden">
        <button onClick={() => setIsExpenseExpanded(prev => !prev)} className="w-full text-left p-4 hover:bg-gray-50 transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-gray-800">Chi phí khác</h3>
              <p className="text-xs text-gray-500 mt-1">Nhấn để mở form ghi nhận chi phí</p>
            </div>
            <span className="text-xs font-bold px-2 py-1 rounded bg-yellow-50 text-yellow-700 border border-yellow-200">{isExpenseExpanded ? 'Thu gọn ▲' : 'Mở rộng ▼'}</span>
          </div>
        </button>

        {isExpenseExpanded && (
          <div className="border-t border-gray-100 p-4 bg-gray-50">
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <Select
                  label="Nhóm chi"
                  value={otherExpenseCategory}
                  onChange={(e: any) => setOtherExpenseCategory(e.target.value)}
                  options={[
                    { value: 'Cám', label: 'Cám gà' },
                    { value: 'Bắp', label: 'Bắp' },
                    { value: 'Xăng dầu', label: 'Xăng dầu xe' },
                    { value: 'Vật tư', label: 'Vật tư khác' },
                    { value: 'Khác', label: 'Khác' },
                  ]}
                />
              </div>
              <Input label="Số tiền" type="number" value={otherExpenseAmount} onChange={(e: any) => setOtherExpenseAmount(e.target.value)} placeholder="0" />
              <Input label="Ghi chú" value={otherExpenseNote} onChange={(e: any) => setOtherExpenseNote(e.target.value)} placeholder="Tuỳ chọn" />
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <Button variant="secondary" onClick={() => navigate('cash')} className="w-full">Mở Sổ quỹ</Button>
              <Button className="w-full" variant="danger" onClick={handleCreateOtherExpense} disabled={isSavingExpense}>{isSavingExpense ? 'Đang lưu...' : '+ Ghi nhận chi phí'}</Button>
            </div>
          </div>
        )}
      </Card>

      <Card title="Phím tắt">
        <div className="grid grid-cols-2 gap-3">
          <Button onClick={() => navigate('pos')} variant="primary" className="flex justify-center items-center gap-2">
            <ICONS.Plus /> Bán Hàng
          </Button>
          <Button onClick={() => navigate('import')} variant="secondary" className="flex justify-center items-center gap-2">
            <ICONS.Inventory /> Nhập Hàng
          </Button>
        </div>
      </Card>
    </div>
  );
}
