import React, { useState } from 'react';
import { UserRole, DeliveryRequest, DeliveryStatus } from './types';
import { CustomerView } from './components/CustomerView';
import { CourierView } from './components/CourierView';
import { Bike, User, ArrowRight, LogOut, Package } from 'lucide-react';

// Custom Motorcycle Helmet Icon
const MotoHelmet = ({ size = 24, className = "" }: { size?: number, className?: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    {/* Helmet Shell - Side Profile */}
    <path d="M19 12a7 7 0 1 0-14 0c0 4.5 3 7.5 7 7.5h6a2.5 2.5 0 0 0 2.5-2.5v-3.5" />
    {/* Visor Area */}
    <path d="M12 10h5a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-5" />
    {/* Hinge / Pivot Point */}
    <circle cx="10" cy="13" r="2" />
  </svg>
);

const App: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [role, setRole] = useState<UserRole>(UserRole.CUSTOMER);
  
  const [requests, setRequests] = useState<DeliveryRequest[]>([
    {
      id: '1',
      itemDescription: 'Documentos Importantes',
      pickupAddress: 'Rua do Acampamento, 300',
      dropoffAddress: 'Av. Rio Branco, 850',
      status: DeliveryStatus.PENDING,
      createdAt: Date.now(),
      recipientName: 'Maria Silva',
      recipientPhone: '(55) 99999-1234',
      paymentMethod: 'PIX',
      payer: 'SENDER'
    },
    {
      id: '2',
      itemDescription: 'Peças de Computador',
      pickupAddress: 'Rua Venâncio Aires, 1500',
      dropoffAddress: 'Av. Nossa Sra. Medianeira, 100',
      status: DeliveryStatus.PENDING,
      createdAt: Date.now(),
      recipientName: 'João Santos',
      recipientPhone: '(55) 98888-5678',
      paymentMethod: 'CASH',
      payer: 'RECIPIENT'
    }
  ]);

  const handleCreateRequest = (newRequest: Omit<DeliveryRequest, 'id' | 'createdAt' | 'status'>) => {
    const request: DeliveryRequest = {
      ...newRequest,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: Date.now(),
      status: DeliveryStatus.PENDING
    };
    setRequests(prev => [request, ...prev]);
  };

  const handleUpdateStatus = (id: string, status: DeliveryStatus) => {
    setRequests(prev => prev.map(req => 
      req.id === id ? { ...req, status } : req
    ));
  };

  const handleLogin = (selectedRole: UserRole) => {
    setRole(selectedRole);
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setRole(UserRole.CUSTOMER); // Reset default
  };

  // --- LOGIN SCREEN ---
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-700 to-indigo-900 flex items-center justify-center p-4 font-sans">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-500">
          <div className="pt-10 pb-6 text-center bg-white">
             <div className="w-20 h-20 bg-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl shadow-purple-200 transform -rotate-3">
               <Bike size={40} className="text-white" />
             </div>
             <h1 className="text-3xl font-extrabold text-gray-900 mb-2 tracking-tight">EntregaFast AI</h1>
             <p className="text-gray-500 text-sm">Escolha seu perfil para começar</p>
          </div>
          
          <div className="p-8 pb-12">
            <div className="flex justify-center gap-8 items-center">
                {/* CUSTOMER BUTTON */}
                <button 
                  onClick={() => handleLogin(UserRole.CUSTOMER)}
                  className="group flex flex-col items-center gap-4 transition-transform hover:scale-105 active:scale-95 focus:outline-none"
                >
                  <div className="w-32 h-32 rounded-full bg-blue-50 border-4 border-white shadow-xl flex items-center justify-center group-hover:bg-blue-600 group-hover:border-blue-200 transition-all duration-300">
                    <User size={48} className="text-blue-600 group-hover:text-white transition-colors" />
                  </div>
                  <div className="text-center">
                    <h3 className="font-bold text-lg text-gray-800 group-hover:text-blue-600 transition-colors">Cliente</h3>
                  </div>
                </button>

                {/* COURIER BUTTON */}
                <button 
                  onClick={() => handleLogin(UserRole.COURIER)}
                  className="group flex flex-col items-center gap-4 transition-transform hover:scale-105 active:scale-95 focus:outline-none"
                >
                  <div className="w-32 h-32 rounded-full bg-purple-50 border-4 border-white shadow-xl flex items-center justify-center group-hover:bg-purple-600 group-hover:border-purple-200 transition-all duration-300">
                    <MotoHelmet size={48} className="text-purple-600 group-hover:text-white transition-colors" />
                  </div>
                  <div className="text-center">
                    <h3 className="font-bold text-lg text-gray-800 group-hover:text-purple-600 transition-colors">Entregador</h3>
                  </div>
                </button>
            </div>
          </div>
          
          <div className="px-8 pb-6 text-center bg-gray-50 pt-4 border-t border-gray-100">
            <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">
              Powered by Gemini AI
            </p>
          </div>
        </div>
      </div>
    );
  }

  // --- MAIN APP ---
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans flex flex-col">
      {/* Mobile-first layout: Navigation is inside the components now */}
      <main className="flex-1 w-full relative">
        {role === UserRole.CUSTOMER ? (
          <CustomerView 
            requests={requests} 
            onRequestCreate={handleCreateRequest} 
            onLogout={handleLogout}
          />
        ) : (
          <CourierView 
            requests={requests} 
            onUpdateStatus={handleUpdateStatus} 
            onSwitchToCustomer={handleLogout}
          />
        )}
      </main>
    </div>
  );
};

export default App;