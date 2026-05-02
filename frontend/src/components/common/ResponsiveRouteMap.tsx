import { MapPin, Navigation } from "lucide-react";
import { RouteMap } from "./RouteMap.js";

type ResponsiveRouteMapProps = {
  markers: any[];
  routes: any[];
  title?: string;
  height?: string;
  showControls?: boolean;
  mapFocus?: any;
  frameAllMarkers?: boolean;
};

export function ResponsiveRouteMap({ 
  markers, 
  routes, 
  title = "", 
  height,
  showControls = true,
  mapFocus = null,
  frameAllMarkers = true 
}: ResponsiveRouteMapProps) {
  // Altura responsive adaptativa
  const responsiveHeight = height || "h-64 w-full min-h-[200px] max-h-[50vh] sm:h-80 sm:max-h-[60vh] lg:h-96 lg:max-h-[70vh]";
  
  return (
    <div className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <RouteMap
        title={title}
        markers={markers}
        routes={routes}
        mapFocus={mapFocus}
        frameAllMarkers={frameAllMarkers}
        heightClass={responsiveHeight}
      />
      
      {showControls && (
        <div className="absolute bottom-4 left-4 right-4 flex justify-between gap-2 sm:bottom-6 sm:left-6 sm:right-6">
          <div className="flex items-center gap-2 rounded-lg bg-white/90 px-3 py-2 text-xs font-medium text-slate-700 shadow-lg backdrop-blur-sm sm:px-4 sm:py-2.5 sm:text-sm">
            <MapPin className="h-3 w-3 text-blue-600 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Origen</span>
            <span className="sm:hidden">O</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-white/90 px-3 py-2 text-xs font-medium text-slate-700 shadow-lg backdrop-blur-sm sm:px-4 sm:py-2.5 sm:text-sm">
            <Navigation className="h-3 w-3 text-emerald-600 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Destino</span>
            <span className="sm:hidden">D</span>
          </div>
        </div>
      )}
    </div>
  );
}
