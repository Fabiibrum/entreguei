import React, { useState, useEffect, useRef } from 'react';
import { DeliveryRequest, DeliveryStatus } from '../types';
import { 
  Menu, Bell, ChevronRight, Home, BarChart2, FileText, HelpCircle, User,
  Timer, XCircle, Layers, MapPin, Navigation, CreditCard, Mail, Phone, Lock, Save, LogOut, ArrowLeft,
  DollarSign, TrendingUp, Calendar, Wallet, Banknote, QrCode, CheckCircle, Package, Copy, AlertCircle, ArrowDownCircle, ArrowUpCircle, ShieldCheck, ArrowRight, Map
} from 'lucide-react';
import L from 'leaflet';
import { Button } from './Button';
import { ChatBot } from './ChatBot';

interface CourierViewProps {
  requests: DeliveryRequest[];
  onUpdateStatus: (id: string, status: DeliveryStatus) => void;
  onSwitchToCustomer: () => void; // Keeps the prop name but effectively acts as Logout
}

// Fixed center: Santa Maria, Rio Grande do Sul, Brasil
const DEFAULT_LAT = -29.6842;
const DEFAULT_LNG = -53.8069;

// Robust number check
const isNum = (val: any): val is number => {
  return typeof val === 'number' && !isNaN(val) && isFinite(val);
};

// Safe coordinate getter
const getSafeLat = (lat: any) => isNum(lat) ? lat : DEFAULT_LAT;
const getSafeLng = (lng: any) => isNum(lng) ? lng : DEFAULT_LNG;

// Deterministic random generator for coordinates with fallback
const getCoordinates = (id: string, centerLat: number, centerLng: number): [number, number] => {
  const baseLat = getSafeLat(centerLat);
  const baseLng = getSafeLng(centerLng);

  const safeId = id || 'default';
  const hash = safeId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  
  // Spread slightly wider for realism
  const latOffset = ((hash % 100) - 50) / 2500; 
  const lngOffset = (((hash * 13) % 100) - 50) / 2500;
  
  return [baseLat + latOffset, baseLng + lngOffset];
};

// Fallback logic if API fails (Manhattan route)
const generateSmartRouteFallback = (start: [number, number], end: [number, number]): [number, number][] => {
  const [startLat, startLng] = start;
  const [endLat, endLng] = end;
  
  const goLatFirst = Math.abs(startLat - endLat) > Math.abs(startLng - endLng);

  if (goLatFirst) {
    return [start, [endLat, startLng], end];
  } else {
    return [start, [startLat, endLng], end];
  }
};

// Fetch Real Route from OSRM (Open Source Routing Machine)
const fetchRoute = async (start: [number, number], end: [number, number]): Promise<[number, number][] | null> => {
  try {
    // OSRM expects "lng,lat" order
    const url = `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.code === 'Ok' && data.routes && data.routes[0]) {
      // Convert GeoJSON [lng, lat] back to Leaflet [lat, lng]
      return data.routes[0].geometry.coordinates.map((coord: number[]) => [coord[1], coord[0]]);
    }
    return null;
  } catch (error) {
    console.warn("Error fetching real route:", error);
    return null;
  }
};

export const CourierView: React.FC<CourierViewProps> = ({ requests, onUpdateStatus, onSwitchToCustomer }) => {
  const [activeTab, setActiveTab] = useState<'home' | 'profile' | 'help' | 'statement'>('home');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number]>([DEFAULT_LAT, DEFAULT_LNG]);
  
  const [isOnline, setIsOnline] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  // Offer Logic
  const [incomingOffer, setIncomingOffer] = useState<DeliveryRequest | null>(null);
  const [ignoredOffers, setIgnoredOffers] = useState<Set<string>>(new Set());
  
  // Active Delivery Logic
  const [activeDelivery, setActiveDelivery] = useState<DeliveryRequest | null>(null);
  
  // Audio Instance for Notifications (Created once)
  const [notificationSound] = useState(() => {
    // Sound: Distinct digital chime
    const audio = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-software-interface-start-2574.mp3');
    audio.volume = 1.0;
    audio.loop = true; // Ring like a phone
    return audio;
  });

  // Profile Data State
  const [profileData, setProfileData] = useState({
    name: 'Carlos Entregador',
    pixKey: 'carlos@email.com',
    email: 'carlos.driver@entregast.com',
    phone: '(55) 99999-8888',
    password: ''
  });

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<{ [key: string]: L.Marker }>({});
  const routeLayerRef = useRef<L.Polyline | null>(null); 
  const userMarkerRef = useRef<L.Marker | null>(null);

  // Statistics - Dynamic Calculation
  const finishedRequests = requests.filter(r => r.status === DeliveryStatus.DELIVERED);
  const todayEarnings = finishedRequests.length * 15.90; // Mock fixed price per ride
  const finishedCount = finishedRequests.length;
  const availableRequests = requests.filter(r => r.status === DeliveryStatus.PENDING);

  // Fix Map Size Issue
  useEffect(() => {
    // Trigger a resize invalidation shortly after mount to ensure map fills container
    const timer = setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [incomingOffer, isOnline, activeTab, activeDelivery]); // Re-trigger when UI changes size

  // --- Active Delivery Detection ---
  useEffect(() => {
    const currentActive = requests.find(r => 
        [DeliveryStatus.ACCEPTED, DeliveryStatus.PICKED_UP, DeliveryStatus.ARRIVED_DESTINATION].includes(r.status)
    );
    setActiveDelivery(currentActive || null);
    
    // Auto switch to home if active
    if (currentActive) {
        setActiveTab('home');
        // Stop incoming offers logic slightly if busy
        setIncomingOffer(null);
    }
  }, [requests]);

  // --- Offer Detection Logic ---
  useEffect(() => {
    if (!isOnline || activeDelivery) {
      setIncomingOffer(null);
      return;
    }

    const nextOffer = requests.find(r => 
      r.status === DeliveryStatus.PENDING && 
      !ignoredOffers.has(r.id)
    );

    if (nextOffer) {
      setIncomingOffer(nextOffer);
      setSelectedId(nextOffer.id);
      
      // Auto switch to home if offer comes in
      setActiveTab('home');

      try {
        if (mapInstanceRef.current && isNum(userLocation[0]) && isNum(userLocation[1])) {
           // Use real coords if available, else fallback
           const coords = (nextOffer.pickupLat && nextOffer.pickupLng) 
                ? [nextOffer.pickupLat, nextOffer.pickupLng] as [number, number]
                : getCoordinates(nextOffer.id, userLocation[0], userLocation[1]);

           if (isNum(coords[0]) && isNum(coords[1])) {
              // Fit bounds to show both user and new offer
              const bounds = L.latLngBounds([userLocation, coords]);
              // Add more padding to the bottom to account for the offer card
              mapInstanceRef.current.fitBounds(bounds, { 
                paddingTopLeft: [50, 50],
                paddingBottomRight: [50, 250], 
                maxZoom: 16 
              });
           }
        }
      } catch (e) {
        console.warn("Map move error:", e);
      }
    } else {
      setIncomingOffer(null);
    }
  }, [requests, isOnline, ignoredOffers, userLocation, activeDelivery]);

  // --- SOUND NOTIFICATION (LOOPING) ---
  useEffect(() => {
    if (incomingOffer) {
        // Start looping sound
        notificationSound.currentTime = 0;
        notificationSound.play().catch(e => {
            console.warn("Autoplay prevented:", e);
        });
    } else {
        // Stop sound
        notificationSound.pause();
        notificationSound.currentTime = 0;
    }
  }, [incomingOffer, notificationSound]);

  // --- Helper for Navigation Coordinates ---
  // Returns the exact [lat, lng] target for the current status
  const getTargetCoordinates = (request: DeliveryRequest): [number, number] | null => {
      if (!isNum(userLocation[0]) || !isNum(userLocation[1])) return null;

      // If status is PICKED_UP or ARRIVED_DESTINATION, we are going to (or are at) the Dropoff location
      if (request.status === DeliveryStatus.PICKED_UP || request.status === DeliveryStatus.ARRIVED_DESTINATION) {
          if (request.dropoffLat && request.dropoffLng) {
            return [request.dropoffLat, request.dropoffLng];
          }
          // Mock shift if real coord missing
          const c = getCoordinates(request.id, userLocation[0], userLocation[1]);
          return [c[0] + 0.01, c[1] + 0.01];
      }
      
      // Else go to Pickup
      if (request.pickupLat && request.pickupLng) {
          return [request.pickupLat, request.pickupLng];
      }
      // Fallback
      return getCoordinates(request.id, userLocation[0], userLocation[1]);
  };

  // --- Helpers for Route Drawing (Always Pickup -> Dropoff) ---
  const getPickupCoords = (req: DeliveryRequest): [number, number] => {
      if (req.pickupLat && req.pickupLng) return [req.pickupLat, req.pickupLng];
      return getCoordinates(req.id, userLocation[0], userLocation[1]);
  };

  const getDropoffCoords = (req: DeliveryRequest): [number, number] => {
      if (req.dropoffLat && req.dropoffLng) return [req.dropoffLat, req.dropoffLng];
      // Fallback relative to pickup
      const pickup = getPickupCoords(req);
      return [pickup[0] + 0.01, pickup[1] + 0.01];
  };

  // --- Real Route Drawing Effect (Handles both Offers and Active Deliveries) ---
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear existing route immediately
    if (routeLayerRef.current) {
      routeLayerRef.current.remove();
      routeLayerRef.current = null;
    }

    const drawRoute = async () => {
      const targetRequest = activeDelivery || incomingOffer;
      
      if (targetRequest && isOnline) {
         try {
           // ALWAYS draw route from Pickup to Dropoff as requested
           const startCoords = getPickupCoords(targetRequest);
           const endCoords = getDropoffCoords(targetRequest);

           if (isNum(startCoords[0]) && isNum(startCoords[1]) && isNum(endCoords[0]) && isNum(endCoords[1])) {
             // 1. Try to fetch real route from OSRM
             let routePoints = await fetchRoute(startCoords, endCoords);

             // 2. Fallback if API fails
             if (!routePoints || routePoints.length === 0) {
                routePoints = generateSmartRouteFallback(startCoords, endCoords);
             }
             
             // 3. Draw Polyline
             if (routePoints && routePoints.length > 0) {
                 routeLayerRef.current = L.polyline(routePoints, {
                   color: activeDelivery ? '#16a34a' : '#9333ea', // Green for active, Purple for offer
                   weight: 6,
                   opacity: 0.9,
                   lineCap: 'round',
                   lineJoin: 'round',
                   dashArray: activeDelivery ? undefined : '10, 10' // Dashed if it's an offer (preview)
                 }).addTo(map);

                 // Fit bounds to include the entire route (Pickup -> Dropoff)
                 const bounds = L.latLngBounds(routePoints.map(p => [p[0], p[1]]));
                 
                 // If user is also on map, include them in bounds
                 if (isNum(userLocation[0]) && isNum(userLocation[1])) {
                    bounds.extend(userLocation);
                 }

                 map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
             }
           }
         } catch (e) {
           console.warn("Route drawing error:", e);
         }
      }
    };

    drawRoute();
    
  }, [incomingOffer, activeDelivery, isOnline, userLocation]);

  const handleAcceptOffer = () => {
    if (incomingOffer) {
      onUpdateStatus(incomingOffer.id, DeliveryStatus.ACCEPTED);
      setIncomingOffer(null);
      setSelectedId(null); 
    }
  };

  const handleDeclineOffer = () => {
    if (incomingOffer) {
      setIgnoredOffers(prev => new Set(prev).add(incomingOffer.id));
      setIncomingOffer(null);
      setSelectedId(null);
      
      try {
        if (mapInstanceRef.current && isNum(userLocation[0]) && isNum(userLocation[1])) {
          mapInstanceRef.current.setView(userLocation, 15);
        }
      } catch (e) {
         console.warn("Map reset error:", e);
      }
    }
  };

  // OPEN WAZE FUNCTION
  const openWaze = () => {
    if (!activeDelivery) return;
    
    const targetCoords = getTargetCoordinates(activeDelivery);
    if (targetCoords) {
       const [lat, lng] = targetCoords;
       // Waze Deep Link
       const url = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
       window.open(url, '_blank');
    }
  };

  // UNIFIED ACTION HANDLER
  const handleProgressAction = () => {
    if (!activeDelivery) return;

    switch (activeDelivery.status) {
        case DeliveryStatus.ACCEPTED:
            // "Cheguei na Coleta" -> Vai para PICKED_UP
            // Se o remetente paga, assumimos que pagou agora.
            onUpdateStatus(activeDelivery.id, DeliveryStatus.PICKED_UP);
            break;
        case DeliveryStatus.PICKED_UP:
            // "Cheguei na Entrega" -> Vai para ARRIVED_DESTINATION
            onUpdateStatus(activeDelivery.id, DeliveryStatus.ARRIVED_DESTINATION);
            break;
        case DeliveryStatus.ARRIVED_DESTINATION:
            // "Finalizar" -> Vai para DELIVERED
            onUpdateStatus(activeDelivery.id, DeliveryStatus.DELIVERED);
            setActiveDelivery(null);
            break;
    }
  };

  // Helper to get button text/color based on state
  const getActionState = () => {
     if (!activeDelivery) return { text: '', color: '', icon: null };
     
     switch (activeDelivery.status) {
         case DeliveryStatus.ACCEPTED:
             // If SENDER pays, we show a payment collection text here
             if (activeDelivery.payer === 'SENDER') {
                return { 
                    text: 'Receber Pagamento e Coletar', 
                    subtext: 'Remetente paga agora',
                    color: 'bg-green-600 hover:bg-green-700 shadow-green-200',
                    icon: <DollarSign size={20} />
                };
             }
             return { 
                 text: 'Cheguei na Coleta', 
                 subtext: 'Confirmar chegada',
                 color: 'bg-blue-600 hover:bg-blue-700 shadow-blue-200',
                 icon: <MapPin size={20} />
             };
         case DeliveryStatus.PICKED_UP:
             return { 
                 text: 'Cheguei na Entrega', 
                 subtext: 'Confirmar chegada no destino',
                 color: 'bg-purple-600 hover:bg-purple-700 shadow-purple-200',
                 icon: <Navigation size={20} />
             };
         case DeliveryStatus.ARRIVED_DESTINATION:
             // If RECIPIENT pays, we show a payment collection text here
             if (activeDelivery.payer === 'RECIPIENT') {
                return { 
                    text: 'Receber e Finalizar', 
                    subtext: 'Cobrar Destinatário',
                    color: 'bg-green-600 hover:bg-green-700 shadow-green-200',
                    icon: <CheckCircle size={20} />
                };
             }
             return { 
                 text: 'Finalizar Entrega', 
                 subtext: 'Confirmar e concluir',
                 color: 'bg-green-600 hover:bg-green-700 shadow-green-200',
                 icon: <CheckCircle size={20} />
             };
         default:
             return { text: '', color: '', icon: null };
     }
  };


  // Get User Location on Mount
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          if (isNum(latitude) && isNum(longitude)) {
            setUserLocation([latitude, longitude]);
            if (mapInstanceRef.current) {
              try {
                mapInstanceRef.current.setView([latitude, longitude], 15);
              } catch(e) {
                console.warn("SetView error:", e);
              }
            }
          }
        },
        (error) => {
          console.warn("Geolocation error, using defaults:", error);
          setUserLocation([DEFAULT_LAT, DEFAULT_LNG]);
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    }
  }, []);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }
    
    try {
      const initLat = getSafeLat(userLocation[0]);
      const initLng = getSafeLng(userLocation[1]);

      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
        zoomAnimation: true
      }).setView([initLat, initLng], 15);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 20
      }).addTo(map);
      
      mapInstanceRef.current = map;
      
      // Force resize to prevent grey areas
      setTimeout(() => { map.invalidateSize(); }, 250);

    } catch (err) {
      console.error("Error initializing map:", err);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []); 

  // Handle User Marker
  useEffect(() => {
    try {
      if (mapInstanceRef.current && isNum(userLocation[0]) && isNum(userLocation[1])) {
        const map = mapInstanceRef.current;
        
        // Changed to Purple
        const driverIconHtml = `
          <div class="relative w-10 h-10 flex items-center justify-center transition-all duration-500 ${!isOnline ? 'grayscale opacity-70' : ''}">
             <div class="w-4 h-4 bg-purple-600 rounded-full border-2 border-white shadow-md z-10 relative"></div>
             <div class="absolute w-10 h-10 bg-purple-600/20 rounded-full animate-pulse"></div>
             <div class="absolute -bottom-1 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[10px] border-t-purple-600 transform translate-y-1"></div>
          </div>
        `;

        const driverIcon = L.divIcon({
          className: 'custom-driver-icon',
          html: driverIconHtml,
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        });

        if (userMarkerRef.current) {
          userMarkerRef.current.setLatLng(userLocation);
          userMarkerRef.current.setIcon(driverIcon);
        } else {
          userMarkerRef.current = L.marker(userLocation, { icon: driverIcon }).addTo(map);
        }
      }
    } catch (e) {
      console.warn("User marker error:", e);
    }
  }, [userLocation, isOnline]);

  // Handle Request Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // DETERMINE WHAT TO SHOW
    // Priority: Incoming Offer > Active Delivery > All Available
    let requestsToShow: DeliveryRequest[] = [];

    if (incomingOffer) {
        requestsToShow = [incomingOffer];
    } else if (activeDelivery) {
        requestsToShow = [activeDelivery];
    } else {
        requestsToShow = availableRequests;
    }

    // CLEANUP: Remove markers not in the 'requestsToShow' list
    Object.keys(markersRef.current).forEach(id => {
      const stillVisible = requestsToShow.find(r => r.id === id);
      if (!stillVisible) {
        if (markersRef.current[id]) {
            markersRef.current[id].remove();
            delete markersRef.current[id];
        }
      }
    });
    
    requestsToShow.forEach(req => {
      try {
        // Use real coords if available, else random
        let coords: [number, number];
        
        // Logic: 
        // If Active Delivery & going to Dropoff -> use Dropoff Coords
        // Else (Pending or going to Pickup) -> use Pickup Coords
        if (activeDelivery?.id === req.id && (req.status === DeliveryStatus.PICKED_UP || req.status === DeliveryStatus.ARRIVED_DESTINATION)) {
             coords = (req.dropoffLat && req.dropoffLng) 
                ? [req.dropoffLat, req.dropoffLng] 
                : getCoordinates(req.id, userLocation[0], userLocation[1]).map(v => v + 0.01) as [number, number]; // mock shift if no real coord
        } else {
             coords = (req.pickupLat && req.pickupLng) 
                ? [req.pickupLat, req.pickupLng] 
                : getCoordinates(req.id, userLocation[0], userLocation[1]);
        }
        
        if (!isNum(coords[0]) || !isNum(coords[1])) return;

        const isSelected = selectedId === req.id || activeDelivery?.id === req.id || incomingOffer?.id === req.id;
        const isPending = req.status === DeliveryStatus.PENDING;
        const isIgnored = ignoredOffers.has(req.id);

        if (isPending && isIgnored && !activeDelivery && !incomingOffer) {
            if (markersRef.current[req.id]) {
                markersRef.current[req.id].remove();
                delete markersRef.current[req.id];
            }
            return;
        }
        
        const isActive = isOnline;
        // Logic for marker color
        const bgColor = activeDelivery 
            ? 'bg-green-600' 
            : (isActive ? (isPending ? 'bg-gray-900' : 'bg-green-600') : 'bg-gray-400');
        
        const iconHtml = `
          <div class="relative flex flex-col items-center justify-center w-10 h-10 transition-all ${!isActive ? 'opacity-50' : ''}">
            <div class="relative flex items-center justify-center w-8 h-8 rounded-full border-2 border-white shadow-lg ${bgColor} text-white transition-transform ${isSelected ? 'scale-110' : ''}">
              ${isPending ? '<span class="text-xs font-bold">R$</span>' : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>'}
            </div>
            <div class="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[6px] border-t-white drop-shadow-sm -mt-0.5"></div>
          </div>
        `;

        const icon = L.divIcon({
          className: 'custom-req-icon',
          html: iconHtml,
          iconSize: [40, 40],
          iconAnchor: [20, 36],
        });

        if (markersRef.current[req.id]) {
          markersRef.current[req.id].setLatLng(coords); 
          markersRef.current[req.id].setIcon(icon);
          markersRef.current[req.id].setZIndexOffset(isSelected ? 1000 : 0);
          
          // UPDATED: Bind popup with address for GPS context
          const address = isPending ? req.pickupAddress : (req.status === DeliveryStatus.ACCEPTED ? req.pickupAddress : req.dropoffAddress);
          markersRef.current[req.id].bindPopup(`
             <div class="text-center">
               <strong class="block text-gray-800">${req.itemDescription}</strong>
               <span class="text-xs text-gray-500">${address}</span>
             </div>
          `);

        } else {
          const marker = L.marker(coords, { icon, zIndexOffset: isSelected ? 1000 : 0 })
            .addTo(map);
          
          // UPDATED: Bind popup initially
          const address = isPending ? req.pickupAddress : (req.status === DeliveryStatus.ACCEPTED ? req.pickupAddress : req.dropoffAddress);
          marker.bindPopup(`
             <div class="text-center">
               <strong class="block text-gray-800">${req.itemDescription}</strong>
               <span class="text-xs text-gray-500">${address}</span>
             </div>
          `);

          // Only allow clicking on pending requests
          if (isPending) {
             marker.on('click', () => { if (isOnline) setSelectedId(req.id); });
          }
          markersRef.current[req.id] = marker;
        }
      } catch (e) {
        console.warn("Request marker error:", e);
      }
    });
  }, [availableRequests, selectedId, userLocation, isOnline, ignoredOffers, activeDelivery, incomingOffer]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col w-full h-full bg-gray-100 font-sans">
      
      {/* 1. MAP LAYER (Only visible in 'home' tab) */}
      <div className={`absolute inset-0 z-0 transition-all duration-500 ${!isOnline ? 'grayscale' : ''}`}>
        <div ref={mapContainerRef} className="w-full h-full" style={{ minHeight: '100%', height: '100%' }} />
      </div>

      {/* 2. PROFILE LAYER (Visible in 'profile' tab) */}
      {activeTab === 'profile' && (
        <div className="absolute inset-0 z-40 bg-white flex flex-col animate-in slide-in-from-right duration-300 overflow-y-auto">
          <div className="p-4 border-b border-gray-100 bg-white sticky top-0 z-10 flex items-center gap-2">
            <button 
              onClick={() => setActiveTab('home')} 
              className="p-2 -ml-2 rounded-full hover:bg-gray-100 text-gray-700 transition-colors"
            >
              <ArrowLeft size={24} />
            </button>
            <h2 className="text-lg font-bold text-gray-900">Meu Perfil</h2>
          </div>
          
          <div className="p-6 pb-24 space-y-6">
            {/* ... Profile content ... */}
            <div className="flex flex-col items-center mb-8">
              <div className="w-24 h-24 bg-gray-200 rounded-full mb-3 relative flex items-center justify-center">
                 <User size={48} className="text-gray-400" />
                 <div className="absolute bottom-0 right-0 bg-green-500 w-6 h-6 rounded-full border-4 border-white"></div>
              </div>
              <h2 className="text-2xl font-bold text-gray-900">{profileData.name}</h2>
              <p className="text-gray-500 text-sm">Entregador desde 2024</p>
            </div>
             
             <Button className="w-full py-4 mt-4 shadow-lg shadow-purple-200 !bg-purple-600 hover:!bg-purple-700">
              <Save size={18} /> Salvar Alterações
            </Button>
             <button onClick={onSwitchToCustomer} className="w-full py-3 text-sm font-medium text-gray-500 hover:text-gray-700 flex items-center justify-center gap-2"><LogOut size={16} /> Sair</button>
          </div>
        </div>
      )}

      {/* 2b. STATEMENT LAYER (DYNAMIC) */}
      {activeTab === 'statement' && (
        <div className="absolute inset-0 z-40 bg-white flex flex-col animate-in slide-in-from-right duration-300 overflow-y-auto">
           <div className="bg-white p-4 border-b border-gray-100 sticky top-0 z-10 flex items-center gap-2 shadow-sm">
              <button onClick={() => setActiveTab('home')} className="p-2 -ml-2 rounded-full hover:bg-gray-100 text-gray-700 transition-colors">
                 <ArrowLeft size={24} />
              </button>
              <h2 className="text-lg font-bold text-gray-900">Extrato e Ganhos</h2>
           </div>
           
           <div className="p-4 bg-purple-600 text-white">
              <p className="text-sm opacity-80 mb-1">Ganhos de Hoje</p>
              <h2 className="text-4xl font-bold">R$ {todayEarnings.toFixed(2).replace('.', ',')}</h2>
              <p className="text-sm mt-2 opacity-90">{finishedCount} corridas finalizadas</p>
           </div>

           <div className="p-4 space-y-4">
              <h3 className="font-bold text-gray-800 text-sm uppercase">Histórico Recente</h3>
              {finishedRequests.length === 0 ? (
                 <div className="text-center py-8 text-gray-400">
                    <p>Nenhuma corrida finalizada hoje.</p>
                 </div>
              ) : (
                <div className="space-y-3">
                  {finishedRequests.map((req, idx) => (
                    <div key={req.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                       <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-green-600">
                             <CheckCircle size={20} />
                          </div>
                          <div>
                             <p className="font-bold text-gray-900">{req.itemDescription}</p>
                             <p className="text-xs text-gray-500">
                                Pago por: {req.payer === 'SENDER' ? 'Remetente' : 'Destinatário'}
                             </p>
                          </div>
                       </div>
                       <p className="font-bold text-green-700">+ R$ 15,90</p>
                    </div>
                  ))}
                </div>
              )}
           </div>
        </div>
      )}

      {/* 2c. HELP/CHAT LAYER */}
      {activeTab === 'help' && (
        <div className="absolute inset-0 z-40 bg-white flex flex-col animate-in slide-in-from-right duration-300">
           <div className="bg-white p-3 border-b flex items-center gap-2 shrink-0">
              <button onClick={() => setActiveTab('home')} className="p-2 rounded-full hover:bg-gray-100">
                 <ArrowLeft size={24} className="text-gray-700" />
              </button>
              <span className="font-bold text-gray-800">Ajuda e Suporte</span>
           </div>
           <ChatBot variant="embedded" />
        </div>
      )}

      {/* 3. TOP HEADER (Only in 'home' tab) */}
      {!incomingOffer && !activeDelivery && activeTab === 'home' && (
        <div className="absolute top-0 left-0 right-0 z-20 pt-4 px-4 pb-2 bg-gradient-to-b from-white/90 to-transparent pointer-events-none">
          <div className="flex justify-between items-center mb-4 relative pointer-events-auto">
            <div className="relative">
              <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2 bg-white rounded-full shadow-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors">
                <Menu size={24} />
              </button>
              {isMenuOpen && (
                <div className="absolute top-12 left-0 w-64 bg-white rounded-xl shadow-2xl border border-gray-100 py-2 animate-in fade-in zoom-in-95 duration-200 overflow-hidden flex flex-col">
                   <div className="px-4 py-3 bg-purple-50 border-b border-purple-100 mb-2">
                     <p className="text-xs font-bold text-purple-600 uppercase tracking-wider">Menu Entregador</p>
                   </div>
                   <button onClick={() => { setActiveTab('home'); setIsMenuOpen(false); }} className="px-4 py-3 hover:bg-gray-50 flex items-center gap-3 text-sm font-medium text-gray-700"><Home size={18}/> Início</button>
                   <button onClick={() => { setActiveTab('statement'); setIsMenuOpen(false); }} className="px-4 py-3 hover:bg-gray-50 flex items-center gap-3 text-sm font-medium text-gray-700"><BarChart2 size={18}/> Extrato</button>
                   <button onClick={() => { setActiveTab('profile'); setIsMenuOpen(false); }} className="px-4 py-3 hover:bg-gray-50 flex items-center gap-3 text-sm font-medium text-gray-700"><User size={18}/> Perfil</button>
                   <button onClick={() => { setActiveTab('help'); setIsMenuOpen(false); }} className="px-4 py-3 hover:bg-gray-50 flex items-center gap-3 text-sm font-medium text-gray-700"><HelpCircle size={18}/> Ajuda</button>
                   <div className="h-px bg-gray-100 my-2"></div>
                   <button onClick={onSwitchToCustomer} className="px-4 py-3 text-red-600 flex items-center gap-3 text-sm font-bold"><LogOut size={18}/> Sair</button>
                </div>
              )}
            </div>
            
            <button 
              onClick={() => setIsOnline(!isOnline)}
              className={`flex items-center gap-2 px-6 py-2 rounded-full shadow-md transition-all transform active:scale-95 ${isOnline ? 'bg-green-500 text-white' : 'bg-gray-500 text-gray-100'}`}
            >
              <div className={`w-2 h-2 rounded-full bg-white ${isOnline ? 'animate-pulse' : ''}`}></div>
              <span className="font-semibold text-sm tracking-wide">{isOnline ? 'Disponível' : 'Indisponível'}</span>
            </button>
            <button onClick={() => setActiveTab('statement')} className="p-2 bg-white rounded-full shadow-sm text-gray-700 relative">
               <DollarSign size={24} />
               <div className="absolute -top-1 -right-1 bg-green-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-white">
                 {finishedCount}
               </div>
            </button>
          </div>
        </div>
      )}

      {/* 4. NEW OFFER NOTIFICATION */}
      {incomingOffer && !activeDelivery && isOnline && activeTab === 'home' && (
        <div className="absolute bottom-0 left-0 right-0 z-50 bg-transparent flex flex-col justify-end pointer-events-none pb-4">
           {/* ... New Offer UI ... */}
           <div className="w-full flex justify-end px-4 mb-2 pointer-events-auto">
              <button onClick={handleDeclineOffer} className="bg-white/90 backdrop-blur-sm text-gray-500 px-4 py-2 rounded-full shadow-md hover:bg-red-50 border border-gray-200 flex items-center gap-2">
                <XCircle size={20} className="text-red-500" /> <span className="text-sm font-bold text-gray-600">Recusar</span>
              </button>
           </div>
           <div className="bg-white rounded-t-2xl shadow-[0_-8px_30px_rgba(0,0,0,0.15)] p-5 animate-in slide-in-from-bottom-full duration-300 pointer-events-auto">
               <div className="flex justify-between items-start mb-4">
                    <div>
                        <span className="bg-purple-100 text-purple-700 text-[10px] font-bold px-2 py-0.5 rounded-md uppercase">Nova Oferta</span>
                        <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">R$ 15,90</h2>
                    </div>
               </div>
               <div className="flex flex-row gap-2 mb-5 overflow-x-auto pb-1">
                   {/* Address details */}
                   <div className="flex-1 bg-gray-50 p-2 border border-gray-100 rounded-lg">
                       <p className="text-xs font-bold text-gray-400">Retirada</p>
                       <p className="font-semibold text-sm">{incomingOffer.pickupAddress.split(',')[0]}</p>
                   </div>
                   <div className="flex-1 bg-purple-50 p-2 border border-purple-100 rounded-lg">
                       <p className="text-xs font-bold text-purple-400">Entrega</p>
                       <p className="font-semibold text-sm">{incomingOffer.dropoffAddress.split(',')[0]}</p>
                   </div>
               </div>
               <button onClick={handleAcceptOffer} className="w-full bg-green-600 hover:bg-green-700 text-white rounded-xl h-12 font-bold shadow-lg shadow-green-200">Aceitar Corrida</button>
           </div>
        </div>
      )}

      {/* 5. ACTIVE DELIVERY PANEL (UNIFIED ACTION FLOW) */}
      {activeDelivery && activeTab === 'home' && (
        <div className="absolute bottom-0 left-0 right-0 z-50 bg-transparent flex flex-col justify-end pointer-events-none pb-0">
             <div className="bg-white rounded-t-3xl shadow-[0_-8px_30px_rgba(0,0,0,0.2)] p-6 animate-in slide-in-from-bottom duration-300 pointer-events-auto">
                {/* Header Info */}
                <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center animate-pulse ${activeDelivery.status === DeliveryStatus.ARRIVED_DESTINATION ? 'bg-green-100 text-green-600' : 'bg-purple-100 text-purple-600'}`}>
                            {activeDelivery.status === DeliveryStatus.ARRIVED_DESTINATION ? <CheckCircle size={24}/> : <Navigation size={24} />}
                        </div>
                        <div>
                            <p className="text-xs font-bold text-gray-500 uppercase">Status do Pedido</p>
                            <h2 className="text-xl font-bold text-gray-900">
                                {activeDelivery.status === DeliveryStatus.ACCEPTED ? 'Indo para Coleta' : 
                                 activeDelivery.status === DeliveryStatus.PICKED_UP ? 'Indo para Entrega' : 'Finalizando'}
                            </h2>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="font-bold text-xl text-purple-600">R$ 15,90</p>
                    </div>
                </div>

                {/* Steps Visualizer (Without Buttons) */}
                <div className="space-y-4 mb-6">
                    {/* Step 1: Pickup */}
                    <div className={`flex items-start gap-4 p-3 rounded-xl border transition-all ${activeDelivery.status === DeliveryStatus.ACCEPTED ? 'bg-blue-50 border-blue-200 ring-2 ring-blue-500 ring-offset-2' : 'bg-gray-50 border-gray-100 opacity-60'}`}>
                        <div className="mt-1">
                             <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${activeDelivery.status !== DeliveryStatus.ACCEPTED ? 'bg-green-500 border-green-500 text-white' : 'bg-white border-blue-500 text-blue-500'}`}>
                                 {activeDelivery.status !== DeliveryStatus.ACCEPTED ? <CheckCircle size={14} /> : <span className="text-xs font-bold">1</span>}
                             </div>
                        </div>
                        <div className="flex-1">
                            <p className="text-xs font-bold uppercase mb-1 text-gray-500">Coleta</p>
                            <p className="text-sm font-semibold text-gray-900">{activeDelivery.pickupAddress}</p>
                            
                            {/* WAZE BUTTON FOR PICKUP */}
                            {activeDelivery.status === DeliveryStatus.ACCEPTED && (
                              <button onClick={openWaze} className="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-xs font-bold hover:bg-blue-200 transition-colors">
                                <Map size={14} /> Navegar com Waze
                              </button>
                            )}
                        </div>
                    </div>

                    {/* Step 2: Dropoff */}
                    <div className={`flex items-start gap-4 p-3 rounded-xl border transition-all ${activeDelivery.status === DeliveryStatus.PICKED_UP || activeDelivery.status === DeliveryStatus.ARRIVED_DESTINATION ? 'bg-purple-50 border-purple-200 ring-2 ring-purple-500 ring-offset-2' : 'bg-gray-50 border-gray-100 opacity-60'}`}>
                        <div className="mt-1">
                             <div className="w-6 h-6 rounded-full bg-white border-2 border-current flex items-center justify-center text-purple-500">
                                 <span className="text-xs font-bold">2</span>
                             </div>
                        </div>
                        <div className="flex-1">
                            <p className="text-xs font-bold uppercase mb-1 text-gray-500">Entrega</p>
                            <p className="text-sm font-semibold text-gray-900">{activeDelivery.dropoffAddress}</p>
                            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1"><User size={12}/> {activeDelivery.recipientName}</p>

                            {/* WAZE BUTTON FOR DROPOFF */}
                            {activeDelivery.status === DeliveryStatus.PICKED_UP && (
                              <button onClick={openWaze} className="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-xs font-bold hover:bg-blue-200 transition-colors">
                                <Map size={14} /> Navegar com Waze
                              </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* --- PAYMENT AT PICKUP (IF SENDER PAYS) --- */}
                {activeDelivery.status === DeliveryStatus.ACCEPTED && activeDelivery.payer === 'SENDER' && (
                    <div className="animate-in slide-in-from-bottom duration-300 mb-4">
                        <div className="bg-white p-3 rounded-xl border-2 border-orange-500 mb-2 flex flex-col items-center text-center shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 right-0 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-bl-lg uppercase">Cobrar Remetente</div>
                            <div className="flex items-center gap-2 mt-2">
                                <DollarSign size={20} className="text-orange-600"/>
                                <h3 className="font-bold text-gray-800 text-sm">Cobrar Agora</h3>
                            </div>
                            
                            {activeDelivery.paymentMethod === 'PIX' ? (
                                <>
                                    <div className="bg-white p-2 rounded-lg border border-gray-200 mb-2 mt-2">
                                        <img
                                        src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=00020126360014BR.GOV.BCB.PIX0114+55999999999520400005303986540515.905802BR5913EntregaFast6008Brasilia62070503***6304ABCD`}
                                        alt="QR Code Pix"
                                        className="w-32 h-32 mix-blend-multiply"
                                        />
                                    </div>
                                    <p className="text-xs text-gray-500">Peça para o remetente escanear</p>
                                </>
                            ) : (
                                <div className="mt-3 w-full p-4 rounded-xl border-2 border-yellow-400 bg-yellow-50 text-yellow-800 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <Banknote size={24}/>
                                        <div>
                                            <p className="font-bold text-xs uppercase opacity-80">Receber Dinheiro</p>
                                            <p className="font-bold text-lg">R$ 15,90</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* --- PAYMENT AT DROPOFF (IF RECIPIENT PAYS) OR ALREADY PAID MSG --- */}
                {activeDelivery.status === DeliveryStatus.ARRIVED_DESTINATION && (
                    <div className="animate-in slide-in-from-bottom duration-300 mb-4">
                        {/* PAYER INFO CARD */}
                        <div className={`mb-4 border rounded-xl p-3 flex items-center justify-between ${activeDelivery.payer === 'SENDER' ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                             <div className="flex items-center gap-2">
                                 {activeDelivery.payer === 'SENDER' ? <CheckCircle size={20} className="text-green-600"/> : <AlertCircle size={20} className="text-orange-600"/>}
                                 <div>
                                     <p className="text-[10px] font-bold text-gray-500 uppercase">Pagamento</p>
                                     <p className={`font-bold text-sm ${activeDelivery.payer === 'SENDER' ? 'text-green-800' : 'text-gray-900'}`}>
                                        {activeDelivery.payer === 'SENDER' ? 'PAGO (Remetente)' : 'COBRAR (Destinatário)'}
                                     </p>
                                 </div>
                             </div>
                        </div>

                        {/* SHOW PAYMENT DETAILS IF RECIPIENT PAYS */}
                        {activeDelivery.payer === 'RECIPIENT' && (
                            <>
                                {activeDelivery.paymentMethod === 'PIX' ? (
                                    <div className="bg-white p-3 rounded-xl border-2 border-orange-500 mb-2 flex flex-col items-center text-center shadow-sm relative overflow-hidden">
                                        <div className="absolute top-0 right-0 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-bl-lg uppercase">Cobrar</div>
                                        <h3 className="font-bold text-gray-800 text-sm mb-1 flex items-center gap-2 mt-1">
                                            <QrCode size={16} className="text-orange-600"/> Pix do Destinatário
                                        </h3>
                                        <div className="bg-white p-2 rounded-lg border border-gray-200 mb-2">
                                            <img
                                            src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=00020126360014BR.GOV.BCB.PIX0114+55999999999520400005303986540515.905802BR5913EntregaFast6008Brasilia62070503***6304ABCD`}
                                            alt="QR Code Pix"
                                            className="w-32 h-32 mix-blend-multiply"
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="mb-2 p-4 rounded-xl border-2 border-yellow-400 bg-yellow-50 text-yellow-800 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <Banknote size={24}/>
                                            <div>
                                                <p className="font-bold text-xs uppercase opacity-80">Cobrar em Dinheiro</p>
                                                <p className="font-bold text-lg">R$ 15,90</p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                        
                        {/* SHOW SENDER PAID MSG */}
                        {activeDelivery.payer === 'SENDER' && (
                             <div className="p-3 bg-green-100 rounded-xl border border-green-300 flex items-center gap-3 mb-2">
                                <ShieldCheck size={24} className="text-green-700" />
                                <div>
                                    <p className="font-bold text-green-800 text-sm">Tudo certo!</p>
                                    <p className="text-xs text-green-700">Entrega já paga na coleta.</p>
                                </div>
                             </div>
                        )}
                    </div>
                )}

                {/* UNIFIED ACTION BUTTON */}
                <div className="mt-2">
                    {(() => {
                        const { text, subtext, color, icon } = getActionState();
                        return (
                            <Button 
                                onClick={handleProgressAction} 
                                className={`w-full py-4 text-lg shadow-xl !flex-col gap-1 h-auto ${color}`}
                            >
                                <div className="flex items-center gap-2">
                                    {icon}
                                    <span className="font-bold">{text}</span>
                                </div>
                                <span className="text-xs font-normal opacity-90">{subtext}</span>
                            </Button>
                        );
                    })()}
                </div>

             </div>
        </div>
      )}

      {/* 6. BOTTOM SHEET (Standard List) */}
      {!incomingOffer && !activeDelivery && activeTab === 'home' && (
        <div className="absolute bottom-0 left-0 right-0 z-10 flex flex-col justify-end max-h-[45vh] pointer-events-none">
          <div className="bg-white rounded-t-3xl shadow-[0_-5px_20px_rgba(0,0,0,0.1)] overflow-hidden pointer-events-auto flex flex-col h-full">
            <div className="w-full flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-300 rounded-full"></div>
            </div>

            <div className="overflow-y-auto p-4 bg-white">
              <div className="pb-4">
                <div className="flex justify-between items-center mb-3">
                   <h3 className="text-sm font-bold text-gray-800">Próximos pedidos</h3>
                </div>

                {!isOnline ? (
                  <div className="text-center py-6 text-gray-400 text-sm bg-gray-50 rounded-xl border border-dashed">
                    Fique online para ver pedidos
                  </div>
                ) : availableRequests.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 text-gray-400">
                     <p className="text-sm">Nenhum pedido disponível.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {availableRequests.map(req => (
                      <div 
                        key={req.id}
                        onClick={() => {
                             setIncomingOffer(req);
                        }}
                        className={`flex flex-col gap-2 p-3 rounded-xl border cursor-pointer hover:bg-gray-50 transition-colors border-gray-100`}
                      >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-xs bg-gray-800`}>
                                    NEW
                                </div>
                                <div>
                                    <p className="font-bold text-sm text-gray-800 line-clamp-1">{req.itemDescription}</p>
                                    <p className="text-xs text-gray-500">{req.pickupAddress.split(',')[0]}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="font-bold text-sm text-gray-900">R$ 15,90</p>
                            </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};