import React, { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { db } from '../services/db';
import { DashboardStats } from '../types';
import { formatCurrency, ICONS } from '../constants';
import { StatCard, Button, Card, SecureValue } from '../components/ui';

// 👇 1. CẬP NHẬT DÒNG NÀY (Thêm onLogout vào props)
export default function Dashboard({ navigate, onLogout }: { navigate: (page: string) => void, onLogout: () => void }) {
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    const data = db.getDashboardStats();
    setStats(data);
  }, []);

  if (!stats) return <div className="p-4">Đang tải...</div>;

  const pieData = [
    { name: 'Thực thu', value: stats.revenueToday, color: '#22c55e' },
    { name: 'Chi nhập gà', value: stats.importToday, color: '#ef4444' }
  ];

  const hasData = pieData.some(d => d.value > 0);

  return (
    <div className="space-y-4 pb-20">
      <header className="flex justify-between items-start mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Tổng quan</h1>
          <p className="text-sm text-gray-500">{new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        
        {/* 👇 2. THÊM NÚT ĐỔI TÀI KHOẢN Ở ĐÂY */}
        <button 
          onClick={onLogout}
          className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 transition-colors"
        >
          Đổi TK ↻
        </button>
      </header>


      {/* Primary KPI */}
      <div className="grid grid-cols-2 gap-3">
        {/* SỬA MỤC LÃI GỘP */}
        <StatCard 
          label="Lãi gộp hôm nay" 
          value={<SecureValue value={formatCurrency(stats.profitToday)} className={stats.profitToday >= 0 ? "text-green-600" : "text-red-600"} />} 
          // color để trống vì đã xử lý bên trong SecureValue
          subtext="Thực thu - Vốn hàng" 
        />
        
        {/* DOANH THU GIỮ NGUYÊN HOẶC ẨN TÙY BẠN (Ở đây tôi giữ nguyên theo yêu cầu là chỉ ẩn Lãi/Vốn) */}
        <StatCard label="Doanh thu (Thực thu)" value={formatCurrency(stats.revenueToday)} color="text-green-600" />
      </div>

       <div className="grid grid-cols-2 gap-3">
        <StatCard label="Khách nợ (Phải thu)" value={formatCurrency(stats.receivables)} color="text-orange-500" />
        
        {/* SỬA MỤC VỐN NHẬP GÀ */}
        <StatCard 
            label="Vốn nhập gà (Tổng)" 
            value={<SecureValue value={formatCurrency(stats.importCapital)} className="text-blue-600" />} 
            subtext="Tổng vốn đã bỏ ra" 
        />
      </div>

      {/* Quick Actions */}
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

      {/* Chart */}
      <Card title="Dòng tiền hôm nay" className="h-72">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
              <Legend verticalAlign="bottom" height={36}/>
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">Chưa có dữ liệu hôm nay</div>
        )}
      </Card>
    </div>
  );
}