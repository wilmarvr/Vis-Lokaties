(function () {
    const axiosInstance = window.axios;
    if (!axiosInstance) {
        console.error('Axios is required for the map UI.');
        return;
    }

    axiosInstance.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';
    const csrfToken = document.querySelector('meta[name="csrf-token"]');
    if (csrfToken) {
        axiosInstance.defaults.headers.common['X-CSRF-TOKEN'] = csrfToken.getAttribute('content');
    }

    const mapElement = document.getElementById('map');
    if (!mapElement) {
        return; // not on the map view
    }

    const L = window.L;
    const JSZip = window.JSZip;
    const turfRef = window.turf;

    if (!L || !JSZip || !turfRef) {
        console.error('Leaflet, JSZip, and Turf.js must be loaded before app.js.');
        return;
    }

    const toolbarEl = document.querySelector('.map-toolbar');
    const selectionPanel = document.getElementById('selection-panel');

    const iconUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png';
    const iconRetinaUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png';
    const shadowUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png';

    const defaultIcon = L.icon({
        iconUrl,
        iconRetinaUrl,
        shadowUrl,
        iconSize: [25, 41],
        iconAnchor: [12, 41],
    });

    L.Marker.prototype.options.icon = defaultIcon;

    initMapApp();

    async function initMapApp() {
        await ensureSanctumSession();
        const map = L.map('map', { preferCanvas: true }).setView([52.4, 5.2], 12);

        const base = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap',
        });
        base.addTo(map);

        const watersLayer = L.geoJSON([], {
            style: () => ({ color: '#33a1ff', weight: 2, fillOpacity: 0.25 }),
            onEachFeature: (_, layer) => layer.on('click', () => layer.bringToFront()),
        }).addTo(map);
        const stekCluster = L.markerClusterGroup({ disableClusteringAtZoom: 18 }).addTo(map);
        const rigCluster = L.markerClusterGroup({ disableClusteringAtZoom: 18 }).addTo(map);
        const distanceLayer = L.layerGroup().addTo(map);
        let heatLayer = null;

        const state = {
            waters: [],
            steks: [],
            rigs: [],
            bathy: [],
            showDistances: true,
            clustering: true,
        };

        attachToolbarHandlers(map, state, () => renderAll());

        await hydrate(state);
        renderAll();

        function renderAll() {
            watersLayer.clearLayers();
            state.waters.forEach((water) => {
                if (water.geometry) {
                    watersLayer.addData(water.geometry);
                }
            });

            stekCluster.clearLayers();
            rigCluster.clearLayers();
            distanceLayer.clearLayers();

            const stekMarkers = new Map();
            state.steks.forEach((stek) => {
                const marker = L.marker([stek.lat, stek.lng], { draggable: true });
                marker.bindTooltip(stek.name);
                marker.on('click', () => showSelection({ type: 'stek', item: stek }));
                attachDragHandler(marker, 'steks', stek, state, () => renderAll());
                addMarker(marker, stekCluster, map, state);
                stekMarkers.set(stek.id, marker);
            });

            state.rigs.forEach((rig) => {
                const marker = L.marker([rig.lat, rig.lng], {
                    draggable: true,
                    icon: L.icon({
                        iconUrl,
                        iconRetinaUrl,
                        shadowUrl,
                        iconSize: [20, 34],
                        iconAnchor: [10, 34],
                    }),
                });
                marker.bindTooltip(rig.name);
                marker.on('click', () => showSelection({ type: 'rig', item: rig }));
                attachDragHandler(marker, 'rigs', rig, state, () => renderAll());
                addMarker(marker, rigCluster, map, state);
                if (state.showDistances && rig.stek_id && stekMarkers.has(rig.stek_id)) {
                    const stekMarker = stekMarkers.get(rig.stek_id);
                    L.polyline([marker.getLatLng(), stekMarker.getLatLng()], {
                        color: '#7bf1a8',
                        weight: 2,
                    }).addTo(distanceLayer);
                }
            });

            renderHeat();
        }

        function renderHeat() {
            if (heatLayer) {
                map.removeLayer(heatLayer);
                heatLayer = null;
            }
            if (!state.bathy.length) {
                return;
            }
            const radius = Number(toolbarEl?.querySelector('[data-heat="radius"]').value || 25);
            const blur = Number(toolbarEl?.querySelector('[data-heat="blur"]').value || 30);
            const min = Number(toolbarEl?.querySelector('[data-heat="min"]').value || 0);
            const max = Number(toolbarEl?.querySelector('[data-heat="max"]').value || 20);
            const points = state.bathy.map((point) => [point.lat, point.lng, scaleDepth(point.depth, min, max)]);
            heatLayer = L.heatLayer(points, { radius, blur, maxZoom: 18 }).addTo(map);
        }

        async function hydrate(target) {
            const [watersRes, steksRes, rigsRes, bathyRes] = await Promise.all([
                axiosInstance.get('/api/waters'),
                axiosInstance.get('/api/steks'),
                axiosInstance.get('/api/rigs'),
                axiosInstance.get('/api/bathy'),
            ]);
            target.waters = unwrap(watersRes);
            target.steks = unwrap(steksRes);
            target.rigs = unwrap(rigsRes);
            target.bathy = unwrap(bathyRes);
        }

        function unwrap(response) {
            return response.data?.data ?? response.data ?? [];
        }

        function addMarker(marker, cluster, mapRef, appState) {
            if (appState.clustering) {
                cluster.addLayer(marker);
            } else {
                marker.addTo(mapRef);
            }
        }

        function showSelection(payload) {
            if (!selectionPanel) return;
            const { type, item } = payload;
            const depth = sampleDepth(item.lat, item.lng, state.bathy);
            const parent = type === 'rig'
                ? state.steks.find((s) => s.id === item.stek_id)
                : state.waters.find((w) => w.id === item.water_id);
            selectionPanel.innerHTML = `
                <div>
                    <strong>${item.name}</strong>
                    <p>Lat: ${Number(item.lat).toFixed(5)}<br>Lng: ${Number(item.lng).toFixed(5)}</p>
                    <p>Depth: ${depth ? depth.toFixed(2) + ' m' : 'n/a'}</p>
                    <p>Parent: ${parent ? parent.name : 'Unlinked'}</p>
                    <p>${item.notes || ''}</p>
                </div>`;
        }

        function attachDragHandler(marker, entity, record, appState, rerender) {
            marker.on('drag', (event) => {
                const ll = event.target.getLatLng();
                const depth = sampleDepth(ll.lat, ll.lng, appState.bathy);
                const info = `${record.name} → ${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)} depth ${(depth || 0).toFixed(2)} m`;
                if (selectionPanel) {
                    selectionPanel.textContent = info;
                }
            });
            marker.on('dragend', async (event) => {
                const ll = event.target.getLatLng();
                const payload = { lat: ll.lat, lng: ll.lng };
                await axiosInstance.patch(`/api/${entity}/${record.id}`, payload);
                await hydrate(appState);
                rerender();
            });
        }

        function attachToolbarHandlers(mapRef, appState, rerender) {
            toolbarEl?.addEventListener('input', (event) => {
                const target = event.target;
                if (!(target instanceof HTMLInputElement)) return;
                if (target.matches('[data-setting="showDistances"]')) {
                    appState.showDistances = target.checked;
                    rerender();
                }
                if (target.matches('[data-setting="cluster"]')) {
                    appState.clustering = target.checked;
                    rerender();
                }
                if (target.matches('[data-heat]')) {
                    rerender();
                }
            });

            toolbarEl?.addEventListener('click', async (event) => {
                const button = event.target.closest('button');
                if (!button) return;
                switch (button.dataset.action) {
                    case 'add-water':
                        await addWater(mapRef, appState);
                        rerender();
                        break;
                    case 'add-stek':
                        await addStek(mapRef, appState);
                        rerender();
                        break;
                    case 'add-rig':
                        await addRig(mapRef, appState);
                        rerender();
                        break;
                    case 'import-bathy':
                        await importBathy(appState, rerender);
                        break;
                    case 'clear-bathy':
                        await axiosInstance.delete('/api/bathy');
                        appState.bathy = [];
                        rerender();
                        break;
                }
            });
        }

        async function addWater(mapRef, appState) {
            const name = window.prompt('Water name?');
            if (!name) return;
            const center = mapRef.getCenter();
            const geometry = turfRef.circle([center.lng, center.lat], 0.2, { steps: 32, units: 'kilometers' });
            await axiosInstance.post('/api/waters', { name, geometry });
            await hydrate(appState);
        }

        async function addStek(mapRef, appState) {
            if (!appState.waters.length) {
                window.alert('Add a water first.');
                return;
            }
            const name = window.prompt('Stek name?') || 'New swim';
            const center = mapRef.getCenter();
            const waterId = nearestWaterId(center.lat, center.lng, appState.waters);
            await axiosInstance.post('/api/steks', {
                name,
                lat: center.lat,
                lng: center.lng,
                water_id: waterId,
            });
            await hydrate(appState);
        }

        async function addRig(mapRef, appState) {
            if (!appState.steks.length) {
                window.alert('Add a stek first.');
                return;
            }
            const name = window.prompt('Rig name?') || 'New rig';
            const center = mapRef.getCenter();
            const stek = nearestStek(center.lat, center.lng, appState.steks);
            await axiosInstance.post('/api/rigs', {
                name,
                lat: center.lat,
                lng: center.lng,
                stek_id: stek?.id,
                water_id: stek?.water_id,
            });
            await hydrate(appState);
        }

        function nearestWaterId(lat, lng, waters) {
            const point = turfRef.point([lng, lat]);
            let best = null;
            waters.forEach((water) => {
                if (!water.geometry) return;
                const polygon = turfRef.feature(water.geometry);
                const distance = turfRef.pointToLineDistance(point, turfRef.polygonToLine(polygon), { units: 'kilometers' });
                if (!best || distance < best.distance) {
                    best = { id: water.id, distance };
                }
            });
            return best?.id ?? waters[0]?.id;
        }

        function nearestStek(lat, lng, steks) {
            const point = turfRef.point([lng, lat]);
            let best = null;
            steks.forEach((stek) => {
                const distance = turfRef.distance(point, turfRef.point([stek.lng, stek.lat]));
                if (!best || distance < best.distance) {
                    best = { ...stek, distance };
                }
            });
            return best;
        }

        async function importBathy(appState, rerender) {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.csv,.zip';
            fileInput.multiple = true;
            fileInput.onchange = async () => {
                const files = Array.from(fileInput.files || []);
                const points = [];
                for (const file of files) {
                    if (file.name.endsWith('.zip')) {
                        const zip = await JSZip.loadAsync(file);
                        for (const entry of Object.values(zip.files)) {
                            if (!entry.dir && entry.name.endsWith('.csv')) {
                                const text = await entry.async('text');
                                points.push(...parseCsv(text));
                            }
                        }
                    } else {
                        const text = await file.text();
                        points.push(...parseCsv(text));
                    }
                }
                if (!points.length) return;
                const batches = chunk(points, 500);
                for (const batch of batches) {
                    await axiosInstance.post('/api/bathy', {
                        points: batch,
                    });
                }
                await hydrate(appState);
                rerender();
            };
            fileInput.click();
        }
    }

    function parseCsv(text) {
        const rows = text.trim().split(/\r?\n/);
        if (!rows.length) return [];
        const delimiter = rows[0].includes(';') ? ';' : ',';
        const headers = rows[0].split(delimiter).map((h) => h.trim().toLowerCase());
        let latIndex = headers.findIndex((h) => h.includes('lat'));
        let lngIndex = headers.findIndex((h) => h.includes('lon'));
        let depthIndex = headers.findIndex((h) => h.includes('dep') || h.includes('depth'));
        if (latIndex === -1 || lngIndex === -1 || depthIndex === -1) {
            latIndex = 0;
            lngIndex = 1;
            depthIndex = 2;
        }
        return rows
            .slice(1)
            .map((line) => {
                const cols = line.split(delimiter);
                return {
                    lat: Number(cols[latIndex]),
                    lng: Number(cols[lngIndex]),
                    depth: Number(cols[depthIndex]),
                };
            })
            .filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lng) && Number.isFinite(row.depth));
    }

    function chunk(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    function scaleDepth(depth, min, max) {
        if (max === min) return 0.5;
        const clamped = Math.min(Math.max(depth, min), max);
        return (clamped - min) / (max - min);
    }

    function sampleDepth(lat, lng, bathyPoints) {
        if (!bathyPoints.length) return null;
        const target = window.turf.point([lng, lat]);
        const sorted = bathyPoints
            .map((point) => ({
                point,
                distance: window.turf.distance(target, window.turf.point([point.lng, point.lat]), { units: 'kilometers' }),
            }))
            .sort((a, b) => a.distance - b.distance)
            .slice(0, 6);
        const numerator = sorted.reduce((sum, entry) => sum + entry.point.depth / Math.max(entry.distance, 0.0001), 0);
        const denominator = sorted.reduce((sum, entry) => sum + 1 / Math.max(entry.distance, 0.0001), 0);
        if (denominator === 0) {
            return null;
        }
        return numerator / denominator;
    }

    async function ensureSanctumSession() {
        try {
            await window.axios.get('/sanctum/csrf-cookie');
        } catch (error) {
            console.warn('Sanctum session not required.', error.message);
        }
    }
})();
