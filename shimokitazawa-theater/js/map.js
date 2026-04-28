/**
 * map.js — Leaflet.js マップ初期化・マーカー管理
 */

(function () {
  'use strict';

  var SHIMOKITAZAWA = [35.6612, 139.6680];
  var DEFAULT_ZOOM = 16;
  var leafletMap = null;
  var markerGroup = null;
  var currentMarkers = {};

  /* ─── 地図初期化 ─────────────────────────────────────────── */
  function initMap() {
    if (leafletMap) return;
    if (!document.getElementById('map-canvas')) return;
    if (typeof L === 'undefined') return;

    leafletMap = L.map('map-canvas', {
      center: SHIMOKITAZAWA,
      zoom: DEFAULT_ZOOM,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(leafletMap);

    markerGroup = L.layerGroup().addTo(leafletMap);

    leafletMap.zoomControl.setPosition('topright');

    window.theaterMap = {
      renderMarkers: renderMarkers,
      invalidateSize: function () { leafletMap && leafletMap.invalidateSize(); },
    };
  }

  /* ─── マーカー描画 ───────────────────────────────────────── */
  function renderMarkers(venues, filteredPerformances) {
    if (!leafletMap || !markerGroup) return;

    markerGroup.clearLayers();
    currentMarkers = {};

    var venuePerformances = {};
    filteredPerformances.forEach(function (p) {
      if (!venuePerformances[p.venueId]) venuePerformances[p.venueId] = [];
      venuePerformances[p.venueId].push(p);
    });

    venues.forEach(function (venue) {
      var perfs = venuePerformances[venue.id] || [];
      if (perfs.length === 0) return;

      var marker = createVenueMarker(venue, perfs);
      marker.addTo(markerGroup);
      currentMarkers[venue.id] = marker;
    });

    renderMapSidebar(venues, venuePerformances);
  }

  function createVenueMarker(venue, perfs) {
    var count = perfs.length;
    var icon = L.divIcon({
      className: 'theater-marker',
      html: '<div class="marker-pin"><div class="marker-count">' + count + '</div></div>',
      iconSize: [44, 52],
      iconAnchor: [22, 52],
      popupAnchor: [0, -52],
    });

    var marker = L.marker([venue.lat, venue.lng], { icon: icon });

    var popupHtml = '<div class="map-popup">' +
      '<strong class="popup-name">' + escHtml(venue.name) + '</strong>' +
      '<p class="popup-address">' + escHtml(venue.address) + '</p>' +
      '<p class="popup-count">' + count + '公演上演中</p>' +
      '<div class="popup-perfs">' +
        perfs.slice(0, 3).map(function (p) {
          return '<div class="popup-perf-item" data-id="' + escHtml(p.id) + '">' +
            '<span class="popup-genre">' + escHtml(p.genre) + '</span>' +
            '<span class="popup-title">' + escHtml(p.title) + '</span>' +
          '</div>';
        }).join('') +
        (perfs.length > 3 ? '<p class="popup-more">ほか ' + (perfs.length - 3) + '公演</p>' : '') +
      '</div>' +
    '</div>';

    marker.bindPopup(popupHtml, {
      maxWidth: 260,
      className: 'theater-popup',
    });

    marker.on('click', function () {
      highlightSidebarItem(venue.id);
    });

    marker.on('popupopen', function () {
      setTimeout(function () {
        document.querySelectorAll('.popup-perf-item').forEach(function (el) {
          el.style.cursor = 'pointer';
          el.addEventListener('click', function () {
            window.theaterApp && window.theaterApp.openModal(el.dataset.id);
          });
        });
      }, 50);
    });

    return marker;
  }

  /* ─── サイドバー ─────────────────────────────────────────── */
  function renderMapSidebar(venues, venuePerformances) {
    var sidebar = document.querySelector('.map-sidebar');
    if (!sidebar) return;

    var activeVenues = venues.filter(function (v) {
      return venuePerformances[v.id] && venuePerformances[v.id].length > 0;
    });

    var totalPerfs = Object.values(venuePerformances).reduce(function (sum, arr) {
      return sum + arr.length;
    }, 0);

    sidebar.innerHTML = '<div class="map-sidebar-header">' +
      '<p class="map-sidebar-title">上演中の劇場</p>' +
      '<p class="map-sidebar-count">' + activeVenues.length + '会場 / ' + totalPerfs + '公演</p>' +
    '</div>' +
    '<div class="map-sidebar-list">' +
      activeVenues.map(function (venue) {
        var perfs = venuePerformances[venue.id] || [];
        return '<div class="map-venue-card" data-venue-id="' + escHtml(venue.id) + '">' +
          '<div class="map-venue-name">' + escHtml(venue.name) + '</div>' +
          '<div class="map-venue-address">' + escHtml(venue.access || venue.address) + '</div>' +
          '<span class="map-venue-count">' + perfs.length + '公演</span>' +
          '<div class="sidebar-perfs">' +
            perfs.map(function (p) {
              return '<div class="sidebar-perf-item" data-id="' + escHtml(p.id) + '">' +
                '<span class="sidebar-genre">' + escHtml(p.genre) + '</span>' +
                '<span class="sidebar-title">' + escHtml(p.title) + '</span>' +
              '</div>';
            }).join('') +
          '</div>' +
        '</div>';
      }).join('') +
    '</div>';

    sidebar.addEventListener('click', function (e) {
      var venueCard = e.target.closest('.map-venue-card');
      if (venueCard && !e.target.closest('.sidebar-perf-item')) {
        var venueId = venueCard.dataset.venueId;
        var marker = currentMarkers[venueId];
        if (marker) {
          leafletMap.setView(marker.getLatLng(), 17, { animate: true });
          marker.openPopup();
        }
        $$('.map-venue-card').forEach(function (c) { c.classList.remove('active'); });
        venueCard.classList.add('active');
      }
    });
  }

  function highlightSidebarItem(venueId) {
    var items = document.querySelectorAll('.map-venue-card');
    items.forEach(function (item) {
      var isTarget = item.dataset.venueId === venueId;
      item.classList.toggle('active', isTarget);
      if (isTarget) {
        item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  }

  function $$(sel) { return Array.from(document.querySelectorAll(sel)); }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ─── Leaflet読み込み後に初期化 ─────────────────────────── */
  function tryInit() {
    if (typeof L !== 'undefined') {
      initMap();
    } else {
      var script = document.querySelector('script[src*="leaflet"]');
      if (script) {
        script.addEventListener('load', initMap);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInit);
  } else {
    tryInit();
  }
})();
