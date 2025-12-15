import React, { useState, useRef, useEffect } from 'react';
import { DeliveryRequest, DeliveryStatus, PaymentMethod, PayerType } from '../types';
import { Button } from './Button';
import { Package, MapPin, Navigation, Truck, Menu, Search, Home, List, LogOut, ArrowLeft, HelpCircle, FileText, User, Phone, Wallet, Banknote, QrCode, CheckCircle, ArrowUpCircle, ArrowDownCircle, AlertCircle, Loader2, ChevronRight } from 'lucide-react';
import L from 'leaflet';
import { ChatBot } from './ChatBot';

interface CustomerViewProps {
  requests: DeliveryRequest[];
  onRequestCreate: (request: Omit<DeliveryRequest, 'id' | 'createdAt' | 'status'>) => void;
  onLogout: () => void;
}

const isNum = (val: any) => typeof val === 'number' && !isNaN(val) && isFinite(val);

// Enhanced Geocoding Helper with Retry Strategy
const geocodeAddress = async (street: string, number: string, neighborhood: string, city: string): Promise<{ lat: number; lng: number, display_name: string, precision: 'exact' | 'street' | 'neighborhood' | 'city' } | null> => {
  // Clean inputs
  const cleanStreet = street.trim();
  const cleanNum = number.trim();
  const cleanCity = city.trim();
  const cleanNeighborhood = neighborhood.trim();

  // Helper to fetch
  const doFetch = async (query: string) => {
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&countrycodes=br&addressdetails=1`);
        const data = await response.json();
        return data && data.length > 0 ? data[0] : null;
      } catch (e) { return null; }
  };

  // ATTEMPT 1: Strict Address (Street + Number + City + RS)
  // We intentionally omit Neighborhood here because OSM often fails if neighborhood doesn't match exactly.
  // We rely on City + Street + Number for best precision.
  if (cleanStreet && cleanNum && cleanCity) {
      const query = `${cleanStreet}, ${cleanNum}, ${cleanCity}, Rio Grande do Sul, Brasil`;
      const result = await doFetch(query);
      if (result) return { lat: parseFloat(result.lat), lng: parseFloat(result.lon), display_name: result.display_name, precision: 'exact' };
  }

  // ATTEMPT 2: Street + City (If number not found)
  if (cleanStreet && cleanCity) {
      const query = `${cleanStreet}, ${cleanCity}, Rio Grande do Sul, Brasil`;
      const result = await doFetch(query);
      if (result) return { lat: parseFloat(result.lat), lng: parseFloat(result.lon), display_name: result.display_name, precision: 'street' };
  }

  // ATTEMPT 3: Neighborhood + City (If street not found)
  if (cleanNeighborhood && cleanCity) {
      const query = `${cleanNeighborhood}, ${cleanCity}, Rio Grande do Sul, Brasil`;
      const result = await doFetch(query);
      if (result) return { lat: parseFloat(result.lat), lng: parseFloat(result.lon), display_name: result.display_name, precision: 'neighborhood' };
  }

  // ATTEMPT 4: Just City (Last resort)
  if (cleanCity) {
      const query = `${cleanCity}, Rio Grande do Sul, Brasil`;
      const result = await doFetch(query);
      if (result) return { lat: parseFloat(result.lat), lng: parseFloat(result.lon), display_name: result.display_name, precision: 'city' };
  }

  return null;
};

export const CustomerView: React.FC<CustomerViewProps> = ({ requests, onRequestCreate, onLogout }) => {
  const [activeTab, setActiveTab] = useState<'home' | 'activity' | 'profile' | 'help'>('home');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  // Form State (New Order)
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Address Validation State
  const [isValidatingPickup, setIsValidatingPickup] = useState(false);
  const [isValidatingDropoff, setIsValidatingDropoff] = useState(false);

  const [formData, setFormData] = useState({
    itemDescription: '',
    
    // Pickup Fields
    pickupStreet: '',
    pickupNumber: '',
    pickupNeighborhood: '',
    pickupCity: '',
    
    // Dropoff Fields
    dropoffStreet: '',
    dropoffNumber: '',
    dropoffNeighborhood: '',
    dropoffCity: '',

    recipientName: '',
    recipientPhone: '',
    paymentMethod: 'PIX' as PaymentMethod,
    payer: 'SENDER' as PayerType,
    
    // Store coords internally
    pickupLat: undefined as number | undefined,
    pickupLng: undefined as number | undefined,
    dropoffLat: undefined as number | undefined,
    dropoffLng: undefined as number | undefined,
  });
  
  // Tracking State
  const [trackingRequest, setTrackingRequest] = useState<DeliveryRequest | null>(null);
  
  // Identify Active Order (Not Delivered)
  const activeOrder = requests.find(r => r.status !== DeliveryStatus.DELIVERED);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const courierMarkerRef = useRef<L.Marker | null>(null);
  const pickupMarkerRef = useRef<L.Marker | null>(null);
  const dropoffMarkerRef = useRef<L.Marker | null>(null);
  const simulationRef = useRef<number | null>(null);

  // Default location (Santa Maria, RS)
  const [userLocation, setUserLocation] = useState<[number, number]>([-29.6842, -53.8069]);

  // Update tracking request object if the requests list changes (e.g. status update)
  useEffect(() => {
    if (trackingRequest) {
      const updated = requests.find(r => r.id === trackingRequest.id);
      if (updated) setTrackingRequest(updated);
    }
  }, [requests]);

  // Get User Location on Mount
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          if (isNum(latitude) && isNum(longitude)) {
            setUserLocation([latitude, longitude]);
          }
        },
        (error) => console.warn("Geolocation error", error),
        { enableHighAccuracy: true }
      );
    }
  }, []);

  // Initialize Background Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    
    if (!mapInstanceRef.current) {
        try {
            const map = L.map(mapContainerRef.current, {
                zoomControl: false,
                attributionControl: false
            }).setView(userLocation, 15);

            L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; OpenStreetMap',
                maxZoom: 20
            }).addTo(map);

            mapInstanceRef.current = map;
        } catch(e) {
            console.error("Map init error", e);
        }
    } else {
        if (!trackingRequest) {
            mapInstanceRef.current.setView(userLocation, 15);
        }
    }

    if (mapInstanceRef.current && !trackingRequest) {
        if (!userMarkerRef.current) {
            const userIcon = L.divIcon({
                className: 'custom-user-marker',
                html: '<div class="w-6 h-6 bg-purple-600 rounded-full border-4 border-white shadow-lg"></div>',
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            });
            userMarkerRef.current = L.marker(userLocation, { icon: userIcon }).addTo(mapInstanceRef.current);
        } else {
            userMarkerRef.current.setLatLng(userLocation);
            userMarkerRef.current.setOpacity(1);
        }
    } else if (userMarkerRef.current) {
        userMarkerRef.current.setOpacity(0);
    }

  }, [userLocation, trackingRequest]); 

  // --- Tracking Logic ---
  useEffect(() => {
    if (!trackingRequest || trackingRequest.status === DeliveryStatus.DELIVERED) {
        if (simulationRef.current) clearInterval(simulationRef.current);
        if (courierMarkerRef.current) { courierMarkerRef.current.remove(); courierMarkerRef.current = null; }
        if (pickupMarkerRef.current) { pickupMarkerRef.current.remove(); pickupMarkerRef.current = null; }
        if (dropoffMarkerRef.current) { dropoffMarkerRef.current.remove(); dropoffMarkerRef.current = null; }
        return;
    }

    if (mapInstanceRef.current && trackingRequest) {
        const map = mapInstanceRef.current;
        const defaultPickup = [userLocation[0] - 0.005, userLocation[1] - 0.005] as [number, number];
        const defaultDropoff = [userLocation[0] + 0.005, userLocation[1] + 0.005] as [number, number];

        const pickup: [number, number] = (trackingRequest.pickupLat && trackingRequest.pickupLng) 
            ? [trackingRequest.pickupLat, trackingRequest.pickupLng] 
            : defaultPickup;
            
        const dropoff: [number, number] = (trackingRequest.dropoffLat && trackingRequest.dropoffLng)
            ? [trackingRequest.dropoffLat, trackingRequest.dropoffLng]
            : defaultDropoff;

        if (!pickupMarkerRef.current) {
             const pickupIcon = L.divIcon({
                className: 'icon-pickup',
                html: '<div class="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-md"></div>',
                iconSize: [16, 16]
             });
             pickupMarkerRef.current = L.marker(pickup, { icon: pickupIcon }).addTo(map).bindPopup('Coleta: ' + trackingRequest.pickupAddress);
        } else {
            pickupMarkerRef.current.setLatLng(pickup);
        }

        if (!dropoffMarkerRef.current) {
             const dropoffIcon = L.divIcon({
                className: 'icon-dropoff',
                html: '<div class="w-4 h-4 bg-orange-500 rounded-full border-2 border-white shadow-md"></div>',
                iconSize: [16, 16]
             });
             dropoffMarkerRef.current = L.marker(dropoff, { icon: dropoffIcon }).addTo(map).bindPopup('Entrega: ' + trackingRequest.dropoffAddress);
        } else {
            dropoffMarkerRef.current.setLatLng(dropoff);
        }

        let startPos = [pickup[0] - 0.01, pickup[1] - 0.01] as [number, number];
        let endPos = pickup;

        if (trackingRequest.status === DeliveryStatus.ACCEPTED) endPos = pickup;
        else if (trackingRequest.status === DeliveryStatus.PICKED_UP) { startPos = pickup; endPos = dropoff; }
        else if (trackingRequest.status === DeliveryStatus.ARRIVED_DESTINATION) { startPos = dropoff; endPos = dropoff; }

        const truckIcon = L.divIcon({
            className: 'custom-truck',
            html: '<div class="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center text-white border-2 border-white shadow-lg transition-all duration-1000"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg></div>',
            iconSize: [40, 40],
            iconAnchor: [20, 20]
        });

        if (!courierMarkerRef.current) {
            courierMarkerRef.current = L.marker(startPos, { icon: truckIcon }).addTo(map);
        }

        let progress = 0;
        if (simulationRef.current) clearInterval(simulationRef.current);
        
        simulationRef.current = window.setInterval(() => {
          progress += 0.005; 
          if (progress > 1) {
              if (trackingRequest.status === DeliveryStatus.ARRIVED_DESTINATION) progress = 1;
              else progress = 0;
          }

          const curLat = startPos[0] + (endPos[0] - startPos[0]) * progress;
          const curLng = startPos[1] + (endPos[1] - startPos[1]) * progress;

          if (courierMarkerRef.current && isNum(curLat) && isNum(curLng)) {
            courierMarkerRef.current.setLatLng([curLat, curLng]);
          }
        }, 50);

        const bounds = L.latLngBounds([pickup, dropoff, startPos]);
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }

    return () => {
        if (simulationRef.current) clearInterval(simulationRef.current);
    };
  }, [trackingRequest, userLocation]);

  // Helper to construct full address string for DB
  const getFullAddress = (type: 'pickup' | 'dropoff') => {
      const street = type === 'pickup' ? formData.pickupStreet : formData.dropoffStreet;
      const num = type === 'pickup' ? formData.pickupNumber : formData.dropoffNumber;
      const hood = type === 'pickup' ? formData.pickupNeighborhood : formData.dropoffNeighborhood;
      const city = type === 'pickup' ? formData.pickupCity : formData.dropoffCity;
      return `${street}, ${num} - ${hood}, ${city}`;
  };

  // Handle Address Validation (Geocoding on Blur of City or Street)
  const handleValidateAddress = async (type: 'pickup' | 'dropoff') => {
      const street = type === 'pickup' ? formData.pickupStreet : formData.dropoffStreet;
      const num = type === 'pickup' ? formData.pickupNumber : formData.dropoffNumber;
      const hood = type === 'pickup' ? formData.pickupNeighborhood : formData.dropoffNeighborhood;
      const city = type === 'pickup' ? formData.pickupCity : formData.dropoffCity;
      
      // We need at least City to start trying
      if (!city) return;

      if (type === 'pickup') setIsValidatingPickup(true);
      else setIsValidatingDropoff(true);

      const result = await geocodeAddress(street, num, hood, city);

      if (type === 'pickup') setIsValidatingPickup(false);
      else setIsValidatingDropoff(false);

      if (result) {
          setFormData(prev => ({
              ...prev,
              [type === 'pickup' ? 'pickupLat' : 'dropoffLat']: result.lat,
              [type === 'pickup' ? 'pickupLng' : 'dropoffLng']: result.lng,
          }));
          
          // Debug/Feedback could go here:
          // if (result.precision === 'city') alert("Atenção: Não encontramos a rua exata, marcaremos o centro da cidade.");
      } else {
          setFormData(prev => ({
              ...prev,
              [type === 'pickup' ? 'pickupLat' : 'dropoffLat']: undefined,
              [type === 'pickup' ? 'pickupLng' : 'dropoffLng']: undefined,
          }));
      }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check fields
    if (!formData.itemDescription || !formData.recipientName || !formData.recipientPhone ||
        !formData.pickupStreet || !formData.pickupNumber || !formData.pickupCity ||
        !formData.dropoffStreet || !formData.dropoffNumber || !formData.dropoffCity) {
            alert("Por favor, preencha todos os campos de endereço.");
            return;
    }

    setIsSubmitting(true);

    let finalPickupLat = formData.pickupLat;
    let finalPickupLng = formData.pickupLng;
    let finalDropoffLat = formData.dropoffLat;
    let finalDropoffLng = formData.dropoffLng;

    // Last check Geocoding if not already done
    if (!finalPickupLat || !finalPickupLng) {
        const pResult = await geocodeAddress(formData.pickupStreet, formData.pickupNumber, formData.pickupNeighborhood, formData.pickupCity);
        if (pResult) {
            finalPickupLat = pResult.lat;
            finalPickupLng = pResult.lng;
        } else {
            setIsSubmitting(false);
            alert("Endereço de Coleta inválido ou não encontrado. Verifique Rua e Cidade.");
            return;
        }
    }

    if (!finalDropoffLat || !finalDropoffLng) {
        const dResult = await geocodeAddress(formData.dropoffStreet, formData.dropoffNumber, formData.dropoffNeighborhood, formData.dropoffCity);
        if (dResult) {
            finalDropoffLat = dResult.lat;
            finalDropoffLng = dResult.lng;
        } else {
            setIsSubmitting(false);
            alert("Endereço de Entrega inválido ou não encontrado. Verifique Rua e Cidade.");
            return;
        }
    }

    onRequestCreate({
      itemDescription: formData.itemDescription,
      pickupAddress: getFullAddress('pickup'),
      dropoffAddress: getFullAddress('dropoff'),
      recipientName: formData.recipientName,
      recipientPhone: formData.recipientPhone,
      paymentMethod: formData.paymentMethod,
      payer: formData.payer,
      pickupLat: finalPickupLat,
      pickupLng: finalPickupLng,
      dropoffLat: finalDropoffLat,
      dropoffLng: finalDropoffLng
    });

    setIsSubmitting(false);

    // Reset form
    setFormData({ 
      itemDescription: '', 
      pickupStreet: '', pickupNumber: '', pickupNeighborhood: '', pickupCity: '',
      dropoffStreet: '', dropoffNumber: '', dropoffNeighborhood: '', dropoffCity: '',
      recipientName: '',
      recipientPhone: '',
      paymentMethod: 'PIX',
      payer: 'SENDER',
      pickupLat: undefined,
      pickupLng: undefined,
      dropoffLat: undefined,
      dropoffLng: undefined
    });
    setIsCreatingOrder(false); // Close modal
    setActiveTab('activity'); // Go to list
  };

  const getStatusText = (status: DeliveryStatus) => {
    switch (status) {
      case DeliveryStatus.PENDING: return "Procurando entregador...";
      case DeliveryStatus.ACCEPTED: return "Entregador a caminho da coleta";
      case DeliveryStatus.PICKED_UP: return "Produto coletado! A caminho da entrega";
      case DeliveryStatus.ARRIVED_DESTINATION: return "Entregador chegou no destino!";
      case DeliveryStatus.DELIVERED: return "Entrega Finalizada";
      default: return "Status desconhecido";
    }
  };

  const getStatusColor = (status: DeliveryStatus) => {
    switch (status) {
      case DeliveryStatus.PENDING: return "bg-yellow-100 text-yellow-700";
      case DeliveryStatus.ACCEPTED: return "bg-blue-100 text-blue-700";
      case DeliveryStatus.PICKED_UP: return "bg-purple-100 text-purple-700";
      case DeliveryStatus.ARRIVED_DESTINATION: return "bg-orange-100 text-orange-700";
      case DeliveryStatus.DELIVERED: return "bg-green-100 text-green-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col w-full h-full bg-gray-100 font-sans">
      
      {/* 1. MAP BACKGROUND (Always visible in Home) */}
      <div className={`absolute inset-0 z-0 transition-all duration-300 ${activeTab !== 'home' ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <div ref={mapContainerRef} className="w-full h-full" />
      </div>

      {/* 2. TOP HEADER (Mobile Style) */}
      {activeTab === 'home' && !isCreatingOrder && !trackingRequest && (
        <div className="absolute top-0 left-0 right-0 z-20 pt-4 px-4 pointer-events-none">
            <div className="flex justify-between items-center pointer-events-auto">
                <button 
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className="p-3 bg-white rounded-full shadow-md text-gray-700 hover:bg-gray-50 active:scale-95 transition-transform"
                >
                    <Menu size={24} />
                </button>
                
                {/* MENU DROPDOWN */}
                {isMenuOpen && (
                <div className="absolute top-16 left-4 w-64 bg-white rounded-xl shadow-2xl border border-gray-100 py-2 animate-in fade-in zoom-in-95 duration-200 overflow-hidden flex flex-col z-50">
                   <div className="px-4 py-3 bg-purple-50 border-b border-purple-100 mb-2">
                     <p className="text-xs font-bold text-purple-600 uppercase tracking-wider">Menu Cliente</p>
                   </div>
                   <button onClick={() => { setActiveTab('home'); setIsMenuOpen(false); }} className="px-4 py-3 hover:bg-gray-50 flex items-center gap-3 text-sm font-medium text-gray-700">
                     <Home size={18} /> Início
                   </button>
                   <button onClick={() => { setActiveTab('activity'); setIsMenuOpen(false); }} className="px-4 py-3 hover:bg-gray-50 flex items-center gap-3 text-sm font-medium text-gray-700">
                     <List size={18} /> Meus Pedidos
                   </button>
                   <button onClick={() => { setActiveTab('help'); setIsMenuOpen(false); }} className="px-4 py-3 hover:bg-gray-50 flex items-center gap-3 text-sm font-medium text-gray-700">
                     <HelpCircle size={18} /> Ajuda IA
                   </button>
                   <div className="h-px bg-gray-100 my-2"></div>
                   <button onClick={onLogout} className="px-4 py-3 hover:bg-red-50 flex items-center gap-3 text-sm font-medium text-red-600">
                     <LogOut size={18} /> Sair
                   </button>
                </div>
                )}

                <div className="bg-white/90 backdrop-blur-md px-4 py-2 rounded-full shadow-sm border border-white/50">
                    <span className="font-bold text-purple-700 text-sm">EntregaFast</span>
                </div>

                <div className="w-10"></div> {/* Spacer for balance */}
            </div>
        </div>
      )}

      {/* 3. HOME - SEARCH BAR OVERLAY */}
      {activeTab === 'home' && !isCreatingOrder && !trackingRequest && (
        <div className="absolute bottom-0 left-0 right-0 z-20 p-4 flex flex-col gap-3">
             {/* NEW: Active Order Status Card */}
             {activeOrder && (
                <div 
                  onClick={() => setTrackingRequest(activeOrder)}
                  className="bg-white rounded-xl shadow-[0_-5px_20px_rgba(0,0,0,0.1)] border-l-4 border-purple-600 p-4 cursor-pointer animate-in slide-in-from-bottom duration-500 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <div className={`p-3 rounded-full ${getStatusColor(activeOrder.status)} bg-opacity-20`}>
                            {activeOrder.status === DeliveryStatus.PENDING ? <Search size={20} /> : <Truck size={20} />}
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Pedido em Andamento</p>
                            <h3 className="font-bold text-gray-900 leading-tight">{activeOrder.itemDescription}</h3>
                            <p className="text-xs text-purple-600 font-medium mt-0.5">
                                {getStatusText(activeOrder.status)}
                            </p>
                        </div>
                    </div>
                    <div className="bg-gray-50 p-2 rounded-full text-gray-400">
                        <ChevronRight size={20} />
                    </div>
                </div>
             )}

             {/* Standard Create Order Panel */}
             <div className="bg-white rounded-2xl shadow-[0_-5px_30px_rgba(0,0,0,0.1)] p-5">
                <h2 className="text-xl font-bold text-gray-900 mb-4">O que vamos entregar hoje?</h2>
                
                <button 
                  onClick={() => setIsCreatingOrder(true)}
                  className="w-full bg-gray-100 hover:bg-gray-200 transition-colors rounded-xl p-4 flex items-center gap-3 text-gray-500 mb-4"
                >
                    <Search size={20} className="text-purple-600" />
                    <span className="font-medium">Quero enviar um pacote...</span>
                </button>

                <div className="flex gap-4 overflow-x-auto pb-2">
                    <div className="flex flex-col items-center gap-2 min-w-[70px]">
                        <div className="w-14 h-14 bg-purple-50 rounded-2xl flex items-center justify-center text-purple-600">
                            <Package size={24} />
                        </div>
                        <span className="text-xs font-semibold text-gray-600">Pacote</span>
                    </div>
                    <div className="flex flex-col items-center gap-2 min-w-[70px]">
                        <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                            <FileText size={24} />
                        </div>
                        <span className="text-xs font-semibold text-gray-600">Doc</span>
                    </div>
                    <div className="flex flex-col items-center gap-2 min-w-[70px]">
                        <div className="w-14 h-14 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-600">
                            <ShoppingBag size={24} />
                        </div>
                        <span className="text-xs font-semibold text-gray-600">Compra</span>
                    </div>
                </div>
             </div>
        </div>
      )}

      {/* 4. ORDER CREATION SHEET */}
      {isCreatingOrder && (
        <div className="absolute inset-0 z-50 bg-white flex flex-col animate-in slide-in-from-bottom duration-300">
             <div className="p-4 border-b border-gray-100 flex items-center gap-2">
                <button onClick={() => setIsCreatingOrder(false)} className="p-2 -ml-2 rounded-full hover:bg-gray-100 text-gray-600">
                    <ArrowLeft size={24} />
                </button>
                <h2 className="font-bold text-lg text-gray-900">Novo Pedido</h2>
             </div>
             
             <div className="flex-1 overflow-y-auto p-5 pb-24">
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">O que você está enviando?</label>
                        <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 focus-within:ring-2 focus-within:ring-purple-500 focus-within:border-transparent transition-all">
                            <textarea
                            className="w-full bg-transparent border-none focus:ring-0 p-0 text-gray-900 placeholder-gray-400"
                            rows={2}
                            placeholder="Ex: Chaves de casa, Um bolo..."
                            value={formData.itemDescription}
                            onChange={(e) => setFormData(prev => ({ ...prev, itemDescription: e.target.value }))}
                            />
                        </div>
                    </div>

                    <div className="space-y-6">
                        {/* PICKUP SECTION */}
                        <div className="relative border-l-2 border-gray-800 pl-4">
                            <label className="text-xs font-bold text-gray-800 uppercase mb-2 block">Retirada</label>
                            <div className="grid grid-cols-[3fr_1fr] gap-3 mb-3">
                                <input
                                    type="text"
                                    className="w-full border-b border-gray-300 py-2 text-gray-900 font-medium focus:outline-none focus:border-purple-600 bg-transparent placeholder-gray-400"
                                    placeholder="Nome da Rua"
                                    value={formData.pickupStreet}
                                    onChange={(e) => setFormData(prev => ({ ...prev, pickupStreet: e.target.value, pickupLat: undefined }))}
                                    onBlur={() => handleValidateAddress('pickup')}
                                />
                                <input
                                    type="text"
                                    className="w-full border-b border-gray-300 py-2 text-gray-900 font-medium focus:outline-none focus:border-purple-600 bg-transparent placeholder-gray-400"
                                    placeholder="Nº"
                                    value={formData.pickupNumber}
                                    onChange={(e) => setFormData(prev => ({ ...prev, pickupNumber: e.target.value, pickupLat: undefined }))}
                                    onBlur={() => handleValidateAddress('pickup')}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <input
                                    type="text"
                                    className="w-full border-b border-gray-300 py-2 text-gray-900 font-medium focus:outline-none focus:border-purple-600 bg-transparent placeholder-gray-400"
                                    placeholder="Bairro"
                                    value={formData.pickupNeighborhood}
                                    onChange={(e) => setFormData(prev => ({ ...prev, pickupNeighborhood: e.target.value }))}
                                />
                                <div className="relative">
                                    <input
                                        type="text"
                                        className="w-full border-b border-gray-300 py-2 text-gray-900 font-medium focus:outline-none focus:border-purple-600 bg-transparent placeholder-gray-400"
                                        placeholder="Cidade"
                                        value={formData.pickupCity}
                                        onChange={(e) => setFormData(prev => ({ ...prev, pickupCity: e.target.value, pickupLat: undefined }))}
                                        onBlur={() => handleValidateAddress('pickup')}
                                    />
                                    <div className="absolute right-0 top-2">
                                        {isValidatingPickup ? <Loader2 className="animate-spin text-purple-600" size={16} /> : 
                                         formData.pickupLat ? <CheckCircle className="text-green-500" size={16} /> : null}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* DROPOFF SECTION */}
                        <div className="relative border-l-2 border-purple-600 pl-4">
                            <label className="text-xs font-bold text-purple-600 uppercase mb-2 block">Entrega</label>
                            <div className="grid grid-cols-[3fr_1fr] gap-3 mb-3">
                                <input
                                    type="text"
                                    className="w-full border-b border-gray-300 py-2 text-gray-900 font-medium focus:outline-none focus:border-purple-600 bg-transparent placeholder-gray-400"
                                    placeholder="Nome da Rua"
                                    value={formData.dropoffStreet}
                                    onChange={(e) => setFormData(prev => ({ ...prev, dropoffStreet: e.target.value, dropoffLat: undefined }))}
                                    onBlur={() => handleValidateAddress('dropoff')}
                                />
                                <input
                                    type="text"
                                    className="w-full border-b border-gray-300 py-2 text-gray-900 font-medium focus:outline-none focus:border-purple-600 bg-transparent placeholder-gray-400"
                                    placeholder="Nº"
                                    value={formData.dropoffNumber}
                                    onChange={(e) => setFormData(prev => ({ ...prev, dropoffNumber: e.target.value, dropoffLat: undefined }))}
                                    onBlur={() => handleValidateAddress('dropoff')}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <input
                                    type="text"
                                    className="w-full border-b border-gray-300 py-2 text-gray-900 font-medium focus:outline-none focus:border-purple-600 bg-transparent placeholder-gray-400"
                                    placeholder="Bairro"
                                    value={formData.dropoffNeighborhood}
                                    onChange={(e) => setFormData(prev => ({ ...prev, dropoffNeighborhood: e.target.value }))}
                                />
                                <div className="relative">
                                    <input
                                        type="text"
                                        className="w-full border-b border-gray-300 py-2 text-gray-900 font-medium focus:outline-none focus:border-purple-600 bg-transparent placeholder-gray-400"
                                        placeholder="Cidade"
                                        value={formData.dropoffCity}
                                        onChange={(e) => setFormData(prev => ({ ...prev, dropoffCity: e.target.value, dropoffLat: undefined }))}
                                        onBlur={() => handleValidateAddress('dropoff')}
                                    />
                                    <div className="absolute right-0 top-2">
                                        {isValidatingDropoff ? <Loader2 className="animate-spin text-purple-600" size={16} /> : 
                                         formData.dropoffLat ? <CheckCircle className="text-green-500" size={16} /> : null}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* RECIPIENT DATA */}
                    <div className="pt-2">
                       <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                          <User size={16} className="text-purple-600"/> Quem vai receber?
                       </h3>
                       <div className="space-y-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
                          <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Nome do Destinatário</label>
                            <input
                              type="text"
                              className="w-full border-b border-gray-200 py-2 text-gray-900 font-medium focus:outline-none focus:border-purple-600 bg-transparent"
                              placeholder="Nome completo"
                              value={formData.recipientName}
                              onChange={(e) => setFormData(prev => ({ ...prev, recipientName: e.target.value }))}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Whatsapp / Telefone</label>
                            <input
                              type="tel"
                              className="w-full border-b border-gray-200 py-2 text-gray-900 font-medium focus:outline-none focus:border-purple-600 bg-transparent"
                              placeholder="(XX) XXXXX-XXXX"
                              value={formData.recipientPhone}
                              onChange={(e) => setFormData(prev => ({ ...prev, recipientPhone: e.target.value }))}
                            />
                          </div>
                       </div>
                    </div>

                    {/* PAYMENT METHOD & PAYER */}
                    <div className="pt-2">
                       <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                          <Wallet size={16} className="text-purple-600"/> Pagamento
                       </h3>
                       
                       {/* Method */}
                       <div className="grid grid-cols-2 gap-3 mb-4">
                          <button
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, paymentMethod: 'PIX' }))}
                            className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${formData.paymentMethod === 'PIX' ? 'border-purple-600 bg-purple-50 text-purple-700' : 'border-gray-100 bg-white text-gray-500'}`}
                          >
                             <QrCode size={24} />
                             <span className="font-bold text-sm">Pix</span>
                          </button>
                          
                          <button
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, paymentMethod: 'CASH' }))}
                            className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${formData.paymentMethod === 'CASH' ? 'border-purple-600 bg-purple-50 text-purple-700' : 'border-gray-100 bg-white text-gray-500'}`}
                          >
                             <Banknote size={24} />
                             <span className="font-bold text-sm">Dinheiro</span>
                          </button>
                       </div>

                       {/* Payer Selection */}
                       <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Quem vai pagar a entrega?</label>
                       <div className="grid grid-cols-2 gap-3">
                           <button
                             type="button"
                             onClick={() => setFormData(prev => ({ ...prev, payer: 'SENDER' }))}
                             className={`p-3 rounded-xl border flex items-center justify-center gap-2 transition-all ${formData.payer === 'SENDER' ? 'border-purple-600 bg-purple-50 text-purple-700 font-bold' : 'border-gray-200 bg-white text-gray-600'}`}
                           >
                              <ArrowUpCircle size={18} /> Eu (Remetente)
                           </button>
                           <button
                             type="button"
                             onClick={() => setFormData(prev => ({ ...prev, payer: 'RECIPIENT' }))}
                             className={`p-3 rounded-xl border flex items-center justify-center gap-2 transition-all ${formData.payer === 'RECIPIENT' ? 'border-purple-600 bg-purple-50 text-purple-700 font-bold' : 'border-gray-200 bg-white text-gray-600'}`}
                           >
                              <ArrowDownCircle size={18} /> Destinatário
                           </button>
                       </div>
                    </div>

                    <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100">
                        <Button type="submit" isLoading={isSubmitting} className="w-full py-4 text-lg !bg-purple-600 hover:!bg-purple-700 shadow-lg shadow-purple-200">
                            Confirmar Pedido
                        </Button>
                    </div>
                </form>
             </div>
        </div>
      )}

      {/* 5. TRACKING OVERLAY */}
      {trackingRequest && (
        <div className="absolute inset-0 z-50 bg-gray-100 flex flex-col">
             <div className="absolute top-0 left-0 right-0 z-20 p-4 pointer-events-none">
                 <button onClick={() => setTrackingRequest(null)} className="pointer-events-auto p-3 bg-white shadow-md rounded-full text-gray-700">
                     <ArrowLeft size={24} />
                 </button>
             </div>
             
             {/* Map Container for Tracking is reused from the background map but interactive logic is handled by effect */}
             <div className="flex-1 relative">
             </div>

             <div className="bg-white rounded-t-3xl shadow-[0_-5px_30px_rgba(0,0,0,0.15)] p-6 z-20">
                <div className="flex items-center gap-4 mb-6">
                    <div className="w-14 h-14 bg-purple-50 rounded-full flex items-center justify-center text-purple-600 animate-pulse">
                        <Truck size={28} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">Pedido em Rota</h2>
                        <p className="text-gray-500 text-sm">{trackingRequest.itemDescription}</p>
                    </div>
                </div>

                <div className="space-y-6 relative">
                    {/* Progress Line */}
                    <div className="absolute left-[19px] top-3 bottom-3 w-0.5 bg-gray-100 -z-10"></div>

                    <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-full bg-green-100 border-4 border-white flex items-center justify-center text-green-700 shrink-0">
                            <Navigation size={18} />
                        </div>
                        <div>
                            <p className="text-xs font-bold text-gray-400 uppercase">Status</p>
                            <p className={`font-semibold ${getStatusColor(trackingRequest.status).split(' ')[1] || 'text-gray-900'}`}>
                                {getStatusText(trackingRequest.status)}
                            </p>
                            <p className="text-xs text-green-600 font-medium">Previsão: 12:40</p>
                        </div>
                    </div>

                    <div className="flex items-start gap-4 opacity-50">
                        <div className="w-10 h-10 rounded-full bg-gray-100 border-4 border-white flex items-center justify-center text-gray-400 shrink-0">
                            <MapPin size={18} />
                        </div>
                        <div>
                            <p className="text-xs font-bold text-gray-400 uppercase">Destino</p>
                            <p className="font-semibold text-gray-900">{trackingRequest.dropoffAddress.split(',')[0]}</p>
                            <p className="text-xs text-gray-500">Rec: {trackingRequest.recipientName}</p>
                        </div>
                    </div>
                </div>
                
                <div className="mt-6 pt-4 border-t border-gray-100 flex gap-3">
                     <button className="flex-1 py-3 bg-gray-50 rounded-xl text-gray-700 font-bold text-sm hover:bg-gray-100">
                         Detalhes
                     </button>
                     <button className="flex-1 py-3 bg-purple-600 rounded-xl text-white font-bold text-sm hover:bg-purple-700 shadow-md shadow-purple-200">
                         Contatar
                     </button>
                </div>
             </div>
        </div>
      )}

      {/* 6. ACTIVITY / ORDERS LIST TAB */}
      {activeTab === 'activity' && (
        <div className="absolute inset-0 z-40 bg-white flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-4 border-b border-gray-100 flex items-center gap-2">
                <button onClick={() => setActiveTab('home')} className="p-2 -ml-2 rounded-full hover:bg-gray-100 text-gray-600">
                    <ArrowLeft size={24} />
                </button>
                <h2 className="font-bold text-lg text-gray-900">Meus Pedidos</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
                {requests.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                        <Package size={48} className="mb-4 opacity-20" />
                        <p>Nenhum pedido realizado.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {requests.map(req => (
                            <div key={req.id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-3">
                                        {req.imageUrl ? (
                                            <img src={req.imageUrl} className="w-12 h-12 rounded-lg object-cover bg-gray-100" />
                                        ) : (
                                            <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400">
                                                <Package size={20} />
                                            </div>
                                        )}
                                        <div>
                                            <h3 className="font-bold text-gray-900">{req.itemDescription}</h3>
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${getStatusColor(req.status)}`}>
                                                {req.status === DeliveryStatus.PENDING ? 'Procurando' :
                                                 req.status === DeliveryStatus.DELIVERED ? 'Entregue' : 'Em Rota'}
                                            </span>
                                        </div>
                                    </div>
                                    <p className="text-sm font-bold text-gray-900">R$ 15,90</p>
                                </div>
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50">
                                   <div className="flex items-center gap-1 text-xs font-medium text-gray-500">
                                      <User size={12}/> {req.recipientName}
                                   </div>
                                   <div className="flex items-center gap-1 text-xs font-bold text-purple-600">
                                      {req.paymentMethod === 'PIX' ? <QrCode size={12}/> : <Banknote size={12}/>}
                                      {req.paymentMethod}
                                      <span className="text-gray-400 font-normal ml-1">
                                        ({req.payer === 'SENDER' ? 'Remetente' : 'Destinatário'})
                                      </span>
                                   </div>
                                </div>
                                
                                {req.status !== DeliveryStatus.DELIVERED && req.status !== DeliveryStatus.PENDING && (
                                    <button 
                                      onClick={() => setTrackingRequest(req)}
                                      className="w-full mt-2 py-2 bg-purple-50 text-purple-700 font-bold text-sm rounded-lg hover:bg-purple-100 transition-colors"
                                    >
                                        Acompanhar
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
      )}

      {/* 7. HELP TAB */}
      {activeTab === 'help' && (
         <div className="absolute inset-0 z-40 bg-white flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-4 border-b border-gray-100 flex items-center gap-2">
                <button onClick={() => setActiveTab('home')} className="p-2 -ml-2 rounded-full hover:bg-gray-100 text-gray-600">
                    <ArrowLeft size={24} />
                </button>
                <h2 className="font-bold text-lg text-gray-900">Ajuda IA</h2>
            </div>
            <ChatBot variant="embedded" />
         </div>
      )}

    </div>
  );
};

// Simple Icon for the Quick categories
const ShoppingBag = ({ size, className }: { size?:number, className?:string }) => (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width={size || 24} 
      height={size || 24} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>
    </svg>
);