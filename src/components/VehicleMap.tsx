import { useEffect } from "react";
import { MapContainer, Marker, TileLayer } from "react-leaflet";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

interface VehicleMapProps {
  lat: number;
  lng: number;
  updatedAt: number;
}

export function VehicleMap({ lat, lng, updatedAt }: VehicleMapProps) {
  useEffect(() => {
    window.dispatchEvent(new Event("resize"));
  }, [lat, lng]);

  return (
    <div className="map-wrap">
      <MapContainer center={[lat, lng]} zoom={15} scrollWheelZoom={false} className="map">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[lat, lng]} />
      </MapContainer>
      <div className="map-caption">
        {lat.toFixed(5)}°N, {lng.toFixed(5)}°E · 更新 {new Date(updatedAt).toLocaleString("zh-CN")}
      </div>
    </div>
  );
}
