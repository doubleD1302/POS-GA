import React from 'react';

export const Button = ({ children, onClick, variant = 'primary', className = '', type = 'button', disabled = false }: any) => {
  const baseStyle = "px-4 py-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-brand-600 text-white hover:bg-brand-900 focus:ring-brand-500",
    secondary: "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 focus:ring-gray-300",
    success: "bg-green-600 text-white hover:bg-green-700 focus:ring-green-500",
    danger: "bg-red-500 text-white hover:bg-red-600 focus:ring-red-400"
  };
  // @ts-ignore
  return <button type={type} disabled={disabled} onClick={onClick} className={`${baseStyle} ${variants[variant]} ${className}`}>{children}</button>;
};

export const Card = ({ children, className = '', title }: any) => (
  <div className={`bg-white rounded-xl shadow-sm border border-gray-100 p-4 ${className}`}>
    {title && <h3 className="text-lg font-semibold text-gray-800 mb-3">{title}</h3>}
    {children}
  </div>
);

// Updated Input for High Contrast: Dark Gray Background + White Text
export const Input = ({ label, value, onChange, type = 'text', placeholder, className = '', disabled, autoFocus }: any) => (
  <div className={`flex flex-col ${className}`}>
    {label && <label className="text-sm font-bold text-gray-700 mb-1">{label}</label>}
    <input
      type={type}
      value={value}
      onChange={onChange}
      disabled={disabled}
      autoFocus={autoFocus}
      placeholder={placeholder}
      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-shadow disabled:bg-gray-200 disabled:text-gray-500"
    />
  </div>
);

// Updated Select for High Contrast
export const Select = ({ label, value, onChange, options, className = '' }: any) => (
  <div className={`flex flex-col ${className}`}>
    {label && <label className="text-sm font-bold text-gray-700 mb-1">{label}</label>}
    <select
      value={value}
      onChange={onChange}
      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
    >
      {options.map((opt: any) => (
        <option key={opt.value} value={opt.value} className="bg-slate-700 text-white">{opt.label}</option>
      ))}
    </select>
  </div>
);

export const StatCard = ({ label, value, color = 'text-gray-900', subtext }: any) => (
  <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col">
    <span className="text-sm text-gray-500">{label}</span>
    <span className={`text-2xl font-bold ${color} mt-1`}>{value}</span>
    {subtext && <span className="text-xs text-gray-400 mt-1">{subtext}</span>}
  </div>
);

export const Modal = ({ isOpen, onClose, title, children }: any) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-[fadeIn_0.2s_ease-out]">
        <div className="flex justify-between items-center p-4 border-b">
          <h3 className="text-lg font-bold text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4">
          {children}
        </div>
      </div>
    </div>
  );
};
// --- Thêm vào file components/ui.tsx ---

export const SecureValue = ({ value, className = '' }: { value: React.ReactNode, className?: string }) => {
  const [isRevealed, setIsRevealed] = React.useState(false);

  const handleReveal = (e: React.MouseEvent) => {
    e.stopPropagation(); 
    
    // Lấy mã doanh nghiệp hiện tại từ LocalStorage
    const currentCode = localStorage.getItem('gttd_current_business_id');
    
    // Hiển thị hộp thoại nhập mã
    const input = window.prompt("🔒 BẢO MẬT: Vui lòng nhập Mã Doanh Nghiệp để xem:");
    
    if (input === currentCode) {
      setIsRevealed(true);
    } else if (input !== null) {
      alert("❌ Mã không đúng! Không thể hiển thị dữ liệu.");
    }
  };

  if (isRevealed) {
    return <span className={`animate-[fadeIn_0.5s] ${className}`}>{value}</span>;
  }

  return (
    <button 
      onClick={handleReveal} 
      className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-gray-200 text-gray-600 hover:bg-gray-300 transition-colors border border-gray-300 shadow-sm cursor-pointer select-none"
    >
      👁 Hiện thông tin
    </button>
  );
};