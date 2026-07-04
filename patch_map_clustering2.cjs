const fs = require('fs');
let code = fs.readFileSync('components/MapSidebar.tsx', 'utf8');

code = code.replace(
    `const MapInner = ({ listings, highlightedId, onBoundsChanged, setActiveMarkerId, activeMarkerId }: any) => {
    const map = useMap();`,
    `const MapInner = ({ listings, highlightedId, onBoundsChanged, setActiveMarkerId, activeMarkerId }: any) => {
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

fs.writeFileSync('components/MapSidebar.tsx', code);
