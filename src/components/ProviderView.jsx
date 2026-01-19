import { useState, useEffect } from 'react';
import { useSocket } from '../hooks/useSocket';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { getCustomerAddressApi, userBookedServiceApi } from '../api/api';
import { useNavigate, useParams } from "react-router-dom";


// Fix for default markers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Customer marker icon
const customerIcon = L.divIcon({
  className: 'custom-customer-marker',
  html: `
    <div style="position: relative; width: 30px; height: 40px;">
      <div style="width: 30px; height: 38px; background: linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%); border-radius: 50% 50% 50% 0; transform: rotate(-45deg); box-shadow: 0 3px 10px rgba(124, 58, 237, 0.5); display: flex; align-items: center; justify-content: center; border: 2px solid white; position: absolute; top: 0; left: 0;">
        <svg style="width: 12px; height: 12px; transform: rotate(45deg);" fill="white" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
        </svg>
      </div>
    </div>
  `,
  iconSize: [30, 40],
  iconAnchor: [15, 40],
});

export const ProviderView = ({ provider }) => {
  const socket = useSocket();
  const navigate = useNavigate()
  const { id } = useParams();

  const [bookings, setBookings] = useState([]);
  const [tripId, setTripId] = useState()
  const [isTracking, setIsTracking] = useState(false);
  const [watchId, setWatchId] = useState(null);
  const [demoMode, setDemoMode] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [customerLocation, setCustomerLocation] = useState();
  const [locationAddress, setLocationAddress] = useState('Getting location...');
  const [route, setRoute] = useState([]);
  const [roadRoute, setRoadRoute] = useState([]);
  const [alternativeRoutes, setAlternativeRoutes] = useState([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [distance, setDistance] = useState(0);
  const [lastAddressFetch, setLastAddressFetch] = useState(0);
  const [lastRouteFetch, setLastRouteFetch] = useState(0);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationAddress("Geolocation not supported");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position?.coords;
        setCurrentLocation({ lat: latitude, lng: longitude });
                  console.log("top ",latitude && longitude);

        if(latitude && longitude){
          console.log("if inside ",latitude && longitude);
          
          localStorage.setItem("currentlocation",currentLocation)
        }
        getAddress(latitude, longitude);
      },
      (error) => {
        console.error("Location error:", error);
        setLocationAddress("Unable to get location");
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude } = position?.coords;
                      console.log("bottom ",latitude && longitude);

            setCurrentLocation({ lat: latitude, lng: longitude });
            getAddress(latitude, longitude);
          },
          () => {},
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
        );
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 30000
      }
    );
  }, []);

  useEffect(() => {
    // Set fixed customer location
    // setCustomerLocation([11.838993, 75.568532]);

    const getBookedService = async () => {
      if (id) {
        try {
          const result = await userBookedServiceApi(id);
          setBookings(result?.bookings);
          console.log(result, "booked service");
          setTripId(result?.bookings[0]?._id);
          setIsTracking(true);
          setCustomerLocation({ lat: result?.bookings[0]?.lat, lng: result?.bookings[0]?.lon });

          console.log(result?.bookings[0]?.lat, result?.bookings[0]?.lon, "booked serviceggggg");
        } catch (error) {
          console.log(error);
        }
      }
    };

    getBookedService();
    console.log('✅ CUSTOMER: Fixed location set - Lat: 11.838993, Lng: 75.568532');
  }, [id]);

  useEffect(() => {
    if (!id || !socket || !currentLocation || !customerLocation) return;

    socket.emit("provider:start", {
      tripId,
      provider,
      lat: currentLocation.lat,
      lng: currentLocation.lng
    });

    const ids = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;

        setCurrentLocation({ lat: latitude, lng: longitude });

        if (customerLocation) {
          getRoadRoute(latitude, longitude, customerLocation.lat, customerLocation.lng);
        }

        socket.emit("provider:location", {
          tripId,
          lat: latitude,
          lng: longitude
        });
      },
      (error) => {
        // Silently continue with last known location
      },
      {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 30000
      }
    );

    setWatchId(ids);
    setIsTracking(true);
  }, [ customerLocation]);

  const getAddress = async (lat, lng) => {
    const now = Date.now();
    if (now - lastAddressFetch < 5000) return;
    
    setLastAddressFetch(now);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
      const data = await response.json();
      if (data.display_name) {
        setLocationAddress(data.display_name);
      }
    } catch (error) {
      setLocationAddress('Address not available');
    }
  };

  const calculateDistance = (lat1, lng1, lat2, lng2) => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const getRoadRoute = async (startLat, startLng, endLat, endLng) => {
    const now = Date.now();
    if (now - lastRouteFetch < 5000) return;
    
    setLastRouteFetch(now);
    try {
      const response = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson&alternatives=2`,
        { mode: 'cors' }
      )
      if (!response.ok) throw new Error('Route fetch failed');
      const data = await response.json();
      if (data?.routes && data?.routes.length > 0) {
        const allRoutes = data.routes.map(route => 
          route.geometry.coordinates.map(coord => [coord[1], coord[0]])
        );
        setRoadRoute(allRoutes[0]);
        setAlternativeRoutes(allRoutes);
        setSelectedRouteIndex(0);
        setDistance(data.routes[0].distance / 1000);
      }
    } catch (error) {
      const dist = calculateDistance(startLat, startLng, endLat, endLng);
      setDistance(dist);
    }
  };

  const handleRouteSelect = (index) => {
    setSelectedRouteIndex(index);
    setRoadRoute(alternativeRoutes[index]);
  };

  const stopTracking = () => {
    if (watchId) {
      navigator.geolocation.clearWatch(watchId);
    }

    socket?.emit("trip:end", tripId);
    setIsTracking(false);
  };

  const handilelogout = () => {
    localStorage.clear()
    navigate()
  }

  useEffect(() => {
    if (isTracking ) {
      const interval = setInterval(() => {
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              const { latitude, longitude } = position.coords;
              setCurrentLocation({ lat: latitude, lng: longitude });
              setRoute(prev => [...prev, [latitude, longitude]]);
              if (socket) {
                socket.emit('provider:location', { tripId, lat: latitude, lng: longitude });
              }
            },
            (error) => {
              console.warn('Location update error:', error.message);
              // Continue with last known location on timeout
            },
            { enableHighAccuracy: false, maximumAge: 10000, timeout: 10000 }
          );
        }
      }, 3000);
      return () => clearInterval(interval);
    }
    return () => {
      if (watchId) {
        if (demoMode) {
          clearInterval(watchId);
        } else {
          navigator.geolocation.clearWatch(watchId);
        }
      }
    };
  }, [watchId, demoMode, isTracking, socket, tripId]);

  return (
    <div style={{ height: '100vh', width: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ flexShrink: 0, alignItems: 'center', display: 'flex', justifyContent: 'space-between', backgroundColor: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px' }}>
          <button style={{ marginRight: '12px' }} onClick={() => window.history.back()}>
            <svg style={{ width: '24px', height: '24px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 style={{ fontSize: '18px', fontWeight: '600', flex: 1, textAlign: 'center', marginRight: '36px' }}>Provider Dashboard</h1>
        </div>
        <div>
          <button className='border rounded-sm py-2 px-3 mx-4 ' onClick={handilelogout}>Logout</button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, position: 'relative' }}>
        {currentLocation ? (
          <div style={{ height: '100%', width: '100%' }}>
            <MapContainer
              center={[currentLocation.lat, currentLocation.lng]}
              zoom={15}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

              {/* Road route to customer */}
              {alternativeRoutes.map((altRoute, index) => (
                <Polyline
                  key={index}
                  positions={altRoute}
                  color={index === selectedRouteIndex ? "#2563eb" : "#94a3b8"}
                  weight={index === selectedRouteIndex ? 4 : 3}
                  opacity={index === selectedRouteIndex ? 0.8 : 0.5}
                  dashArray={index === selectedRouteIndex ? "" : "5, 10"}
                  eventHandlers={{
                    click: () => handleRouteSelect(index)
                  }}
                />
              ))}

              <Marker position={[currentLocation.lat, currentLocation.lng]}>
                <Popup>
                  <div style={{ textAlign: 'center' }}>
                    <strong>📍 Provider Location</strong><br />
                    Lat: {currentLocation.lat}<br />
                    Lng: {currentLocation.lng}<br />
                    <small>{locationAddress}</small>
                    {isTracking && <><br /><span style={{ color: '#22c55e', fontSize: '12px' }}>• Live Tracking</span></>}
                  </div>
                </Popup>
              </Marker>
              {customerLocation && (
                <Marker position={[customerLocation.lat, customerLocation.lng]} icon={customerIcon}>
                  <Popup>
                    <div style={{ textAlign: 'center' }}>
                      <strong>👤 Customer Location</strong><br />
                      Lat: {customerLocation.lat}<br />
                      Lng: {customerLocation.lng}<br />
                      <span style={{ color: '#7c3aed', fontSize: '12px' }}>• Destination</span>
                    </div>
                  </Popup>
                </Marker>
              )}
            </MapContainer>
          </div>
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📍</div>
              <p style={{ color: '#6b7280' }}>Getting your location...</p>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Card */}
      <div style={{ flexShrink: 0 }}>
        {/* Green Provider Card */}
        <div style={{ backgroundColor: '#22c55e', color: 'white', padding: '16px 20px', boxShadow: '0 10px 15px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <svg style={{ width: '28px', height: '28px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
              </svg>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 'bold' }}>{provider.name}</h2>
                <p style={{ fontSize: '12px', opacity: 0.9 }}>Service Provider</p>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
            <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span style={{ opacity: 0.9 }}>Trip ID: {tripId}</span>
          </div>
          {distance > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', marginTop: '8px' }}>
              <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              <span style={{ opacity: 0.9 }}>Distance to customer: {distance.toFixed(1)} km</span>
            </div>
          )}
        </div>

        {/* Notes Card */}
        <div style={{ backgroundColor: '#f8fafc', padding: '12px 20px', borderTop: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            <div style={{ marginBottom: '8px', fontWeight: '600', color: '#374151' }}>📋 Map Legend:</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '16px', height: '3px', backgroundColor: '#2563eb' }}></div>
                <span>Blue: Road route to customer</span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ backgroundColor: 'white', padding: '0px 20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

            <>

              <button
                onClick={() => navigate('/bookedservice')}
                style={{ width: '100%', backgroundColor: '#dc2626', color: 'white', fontWeight: '600', padding: '12px', borderRadius: '12px', border: 'none', cursor: 'pointer' }}
              >
                Booked Services history
              </button>
            </>

          </div>
        </div>

        {/* White Controls Card */}
        <div style={{ backgroundColor: 'white', padding: '16px 20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {!isTracking ? (
              <>

                {/* <button
                  onClick={startTracking}
                  style={{ width: '100%', backgroundColor: '#16a34a', color: 'white', fontWeight: '600', padding: '12px', borderRadius: '12px', border: 'none', cursor: 'pointer' }}
                >
                  📍 Start Real GPS Tracking
                </button> */}
              </>
            ) : (
              <button
                onClick={stopTracking}
                style={{ width: '100%', backgroundColor: '#dc2626', color: 'white', fontWeight: '600', padding: '12px', borderRadius: '12px', border: 'none', cursor: 'pointer' }}
              >
                🛑 Stop Tracking
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};