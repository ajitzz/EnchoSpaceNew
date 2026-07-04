const fs = require('fs');
let code = fs.readFileSync('components/MapSidebar.tsx', 'utf8');

const oldClusterCode = `const useMarkerCluster = (map, markers) => {
    const clusterer = useRef(null);

    useEffect(() => {
        if (!map) return;
        if (!clusterer.current) {
            clusterer.current = new MarkerClusterer({ map });
        }
    }, [map]);`;

const newClusterCode = `const useMarkerCluster = (map, markers) => {
    const clusterer = useRef(null);

    useEffect(() => {
        if (!map) return;
        if (!clusterer.current) {
            const renderer = {
                render: ({ count, position }) => {
                    const el = document.createElement('div');
                    el.className = 'flex items-center justify-center bg-gray-900 text-white rounded-full font-bold shadow-xl border-2 border-white transition-transform hover:scale-110';
                    el.style.width = '44px';
                    el.style.height = '44px';
                    el.style.fontSize = '15px';
                    el.innerText = count;
                    return new google.maps.marker.AdvancedMarkerElement({
                        position,
                        content: el,
                        zIndex: 100
                    });
                }
            };
            clusterer.current = new MarkerClusterer({ map, renderer });
        }
    }, [map]);`;

code = code.replace(oldClusterCode, newClusterCode);
fs.writeFileSync('components/MapSidebar.tsx', code);
