import React, { useEffect, useState } from 'react';
import { db } from '../services/db';
import { DashboardStats } from '../types';
import { formatCurrency, ICONS } from '../constants';
import { StatCard, Button, Card } from '../components/ui';

export default function Dashboard({ navigate, onLogout }: { navigate: (page: string) => void, onLogout: () => void }) {
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    const data = db.getDashboardStats();
    setStats(data);
  }, []);

  if (!stats) return <div className="p-4">Đang tải...</div>;

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

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Lãi gộp hôm nay" value={formatCurrency(stats.profitToday)} color={stats.profitToday >= 0 ? "text-green-600" : "text-red-600"} subtext="Thực thu - Vốn hàng" />
        <StatCard label="Doanh thu (Thực thu)" value={formatCurrency(stats.revenueToday)} color="text-green-600" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Khách nợ (Phải thu)" value={formatCurrency(stats.receivables)} color="text-orange-500" />
        <StatCard label="Vốn nhập gà (Tổng)" value={formatCurrency(stats.importCapital)} color="text-blue-600" subtext="Tổng vốn đã bỏ ra" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Chi khác hôm nay" value={formatCurrency(stats.otherExpenseToday)} color="text-yellow-600" />
        <StatCard label="Tổng chi hôm nay" value={formatCurrency(stats.totalExpenseToday)} color="text-red-600" />
      </div>

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
