const fs = require('fs');
let code = fs.readFileSync('components/MapSidebar.tsx', 'utf8');

// We need to implement proper MarkerClusterer using the provided @googlemaps/markerclusterer
const useClusterCode = `
const useMarkerCluster = (map, markers) => {
    const clusterer = useRef(null);

    useEffect(() => {
        if (!map) return;
        if (!clusterer.current) {
            clusterer.current = new MarkerClusterer({ map });
        }
    }, [map]);

    useEffect(() => {
        if (!clusterer.current) return;
        clusterer.current.clearMarkers();
        clusterer.current.addMarkers(Object.values(markers));
    }, [markers]);
};
`;

code = code.replace(
    `const markerPrices = new WeakMap<google.maps.marker.AdvancedMarkerElement, number>();`,
    useClusterCode + `\nconst markerPrices = new WeakMap<google.maps.marker.AdvancedMarkerElement, number>();`
);

// We need to store markers in MapInner
code = code.replace(
    `const MapInner = ({ listings, highlightedId, onBoundsChanged, setActiveMarkerId, activeMarkerId }: { listings: Listing[], highlightedId: string | null, onBoundsChanged?: (bounds: {minLat: number, maxLat: number, minLng: number, maxLng: number}) => void, setActiveMarkerId: (id: string | null) => void, activeMarkerId: string | null }) => {
    const map = useMap();`,
    `const MapInner = ({ listings, highlightedId, onBoundsChanged, setActiveMarkerId, activeMarkerId }: { listings: Listing[], highlightedId: string | null, onBoundsChanged?: (bounds: {minLat: number, maxLat: number, minLng: number, maxLng: number}) => void, setActiveMarkerId: (id: string | null) => void, activeMarkerId: string | null }) => {
    const map = useMap();
    const [markers, setMarkers] = useState<{[key: string]: google.maps.marker.AdvancedMarkerElement}>({});
    
    useMarkerCluster(map, markers);
    
    const setMarkerRef = useCallback((key: string, marker: google.maps.marker.AdvancedMarkerElement | null) => {
        setMarkers(prev => {
            if (marker) {
                if (prev[key] === marker) return prev;
                return { ...prev, [key]: marker };
            } else {
                if (!prev[key]) return prev;
                const newMarkers = { ...prev };
                delete newMarkers[key];
                return newMarkers;
            }
        });
    }, []);`
);

// Remove the inline setMarkerRef passing because we already have it in MapInner
// But wait, the previous code had a setMarkerRef but it was not defined anywhere! Let's check.
// Wait, my replace might fail if the definition of MapInner isn't exactly that. Let's check how MapInner is defined.
