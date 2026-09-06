const state = {
  currentView: 'home', // 'home' | 'category' | 'detail' | 'gallery' | 'admin'
  selectedCity: 'hyderabad',
  selectedLanguage: 'telugu',
  currentCategoryId: null,
  currentServiceId: null
};

// Firebase Cloud Configuration & Global Realtime Sync
window.VPP_CLOUD_IMAGES = {};
window.VPP_CLOUD_PRICES = {};
let db = null;
let storage = null;
let auth = null;

try {
  if (typeof firebase !== 'undefined') {
    const firebaseConfig = window.FIREBASE_CONFIG || {
      apiKey: "YOUR_FIREBASE_API_KEY", // Replace with your real Firebase API Key from Firebase Console
      authDomain: "vedic-pooja-pandit.firebaseapp.com",
      projectId: "vedic-pooja-pandit",
      storageBucket: "vedic-pooja-pandit.appspot.com",
      messagingSenderId: "9014747545",
      appId: "1:9014747545:web:vpp2026cloudsync"
    };

    // Only initialize if a real valid API key is supplied (not placeholder)
    if (firebaseConfig.apiKey && !firebaseConfig.apiKey.includes('YOUR_FIREBASE_API_KEY') && !firebaseConfig.apiKey.includes('SacredPoojaCloudKey')) {
      if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
      }
      db = firebase.firestore();
      if (firebase.storage) storage = firebase.storage();
      if (firebase.auth) auth = firebase.auth();

      // Listen for Realtime Cloud Image Database updates across all devices
      db.collection("custom_images").onSnapshot((snapshot) => {
        snapshot.forEach((doc) => {
          const data = doc.data();
          if (data && data.image) {
            window.VPP_CLOUD_IMAGES[doc.id] = data.image;
          }
        });
        if (typeof handleRoute === 'function') {
          handleRoute();
        }
      }, (error) => {});

      // Listen for Realtime Cloud Price Database updates across all devices
      db.collection("custom_prices").onSnapshot((snapshot) => {
        snapshot.forEach((doc) => {
          const data = doc.data();
          if (data && (data.priceMin !== undefined || data.priceMax !== undefined)) {
            window.VPP_CLOUD_PRICES[doc.id] = {
              priceMin: data.priceMin,
              priceMax: data.priceMax
            };
          }
        });
        if (typeof handleRoute === 'function') {
          handleRoute();
        }
      }, (error) => {});
    } else {
      console.info("ℹ️ Local storage mode active. Provide a valid Firebase API Key in app.js or window.FIREBASE_CONFIG for live multi-device cloud sync.");
    }
  }
} catch (e) {
  console.warn("Cloud DB fallback mode:", e);
}

// Mobile Photo Compressor Helper (Scales mobile camera photo to 800px @ 80% JPEG)
function compressImageFile(file, callback) {
  if (!file || !file.type || !file.type.startsWith('image/')) {
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => callback(e.target.result);
      reader.readAsDataURL(file);
    }
    return;
  }

  const reader = new FileReader();
  reader.onload = function(evt) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      const MAX_WIDTH = 650;

      if (width > MAX_WIDTH) {
        height = Math.round((height * MAX_WIDTH) / width);
        width = MAX_WIDTH;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.75);
      callback(compressedDataUrl);
    };
    img.onerror = function() {
      callback(evt.target.result);
    };
    img.src = evt.target.result;
  };
  reader.readAsDataURL(file);
}

function getCustomPrices() {
  try {
    const local = JSON.parse(localStorage.getItem('vpp_custom_prices') || '{}');
    return { ...local, ...(window.VPP_CLOUD_PRICES || {}) };
  } catch (e) {
    return window.VPP_CLOUD_PRICES || {};
  }
}

function saveCustomPrice(serviceId, priceMin, priceMax) {
  if (!serviceId) return;
  if (!window.VPP_CLOUD_PRICES) window.VPP_CLOUD_PRICES = {};

  const currentPrices = getCustomPrices();
  const existing = currentPrices[serviceId] || {};

  const minParsed = (priceMin !== undefined && priceMin !== '' && priceMin !== null) ? parseInt(priceMin, 10) : existing.priceMin;
  const maxParsed = (priceMax !== undefined && priceMax !== '' && priceMax !== null) ? parseInt(priceMax, 10) : existing.priceMax;

  const finalMin = !isNaN(minParsed) ? minParsed : (existing.priceMin || 0);
  const finalMax = !isNaN(maxParsed) ? maxParsed : (existing.priceMax || 0);

  window.VPP_CLOUD_PRICES[serviceId] = { priceMin: finalMin, priceMax: finalMax };

  try {
    const prices = JSON.parse(localStorage.getItem('vpp_custom_prices') || '{}');
    prices[serviceId] = { priceMin: finalMin, priceMax: finalMax };
    localStorage.setItem('vpp_custom_prices', JSON.stringify(prices));
  } catch (e) {}

  if (db) {
    try {
      db.collection("custom_prices").doc(serviceId).set({
        priceMin: finalMin,
        priceMax: finalMax,
        updatedAt: new Date().toISOString()
      });
    } catch (e) {}
  }
}

function getCustomImages() {
  try {
    const local = JSON.parse(localStorage.getItem('vpp_custom_images') || '{}');
    return { ...local, ...window.VPP_CLOUD_IMAGES }; // LIVE CLOUD DB ALWAYS WINS OVER LOCAL STALE CACHE!
  } catch (e) {
    return window.VPP_CLOUD_IMAGES || {};
  }
}

function saveCustomImage(serviceId, imageData) {
  // 1. Save to Local Memory & LocalStorage (Instant local feedback)
  window.VPP_CLOUD_IMAGES[serviceId] = imageData;
  try {
    const images = JSON.parse(localStorage.getItem('vpp_custom_images') || '{}');
    images[serviceId] = imageData;
    localStorage.setItem('vpp_custom_images', JSON.stringify(images));
  } catch (e) {}

  // 2. Primary: Save to Firebase Firestore Cloud DB (100% CORS-Free Realtime Cloud Sync across all devices)
  if (db) {
    try {
      db.collection("custom_images").doc(serviceId).set({
        image: imageData,
        updatedAt: new Date().toISOString()
      }).then(() => {
        showToast('☁️ Saved to Cloud! Syncing live across all devices globally.');
      }).catch((err) => {
        console.warn("Cloud Firestore save warning:", err);
      });
    } catch (e) {}
  }
}

// Cloudinary CDN Image Upload Helper (Preset: vedicpoojapandit, Cloud: kqqadx7z)
async function uploadToCloudinary(fileOrBase64, serviceId = null) {
  if (!fileOrBase64) return null;

  try {
    const formData = new FormData();
    formData.append("file", fileOrBase64);
    formData.append("upload_preset", "vedicpoojapandit");

    const response = await fetch(
      "https://api.cloudinary.com/v1_1/kqqadx7z/image/upload",
      {
        method: "POST",
        body: formData,
      }
    );

    const data = await response.json();

    if (data && data.secure_url) {
      const cdnUrl = data.secure_url;
      console.log("☁️ Cloudinary Upload Success:", cdnUrl);

      if (serviceId) {
        saveCustomImage(serviceId, cdnUrl);
        const thumbEl = document.getElementById(`admin-thumb-${serviceId}`);
        if (thumbEl) thumbEl.src = cdnUrl;
      }

      showToast('☁️ Uploaded to Cloudinary successfully!');
      return cdnUrl;
    } else {
      throw new Error(data && data.error ? data.error.message : 'Cloudinary upload failed');
    }
  } catch (error) {
    console.error("Cloudinary upload error:", error);
    showToast('⚠️ Cloudinary upload failed. Check console for details.');
    return null;
  }
}


function resetCustomService(serviceId) {
  const prices = getCustomPrices();
  delete prices[serviceId];
  localStorage.setItem('vpp_custom_prices', JSON.stringify(prices));

  const images = getCustomImages();
  delete images[serviceId];
  localStorage.setItem('vpp_custom_images', JSON.stringify(images));
}

function getEffectiveService(service) {
  if (!service) return service;
  const prices = getCustomPrices();
  const images = getCustomImages();
  
  const customP = prices[service.id];
  const customImg = images[service.id];

  return {
    ...service,
    priceMin: customP ? customP.priceMin : service.priceMin,
    priceMax: customP ? customP.priceMax : service.priceMax,
    image: customImg ? customImg : service.image
  };
}

function showToast(message) {
  let toast = document.getElementById('vpp-toast-el');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'vpp-toast-el';
    toast.className = 'vpp-toast';
    document.body.appendChild(toast);
  }
  toast.innerHTML = `<span class="vpp-toast__icon">🕉️</span> <span>${message}</span>`;
  toast.classList.add('vpp-toast--show');
  setTimeout(() => {
    toast.classList.remove('vpp-toast--show');
  }, 3000);
}

// Image mapping helper function
function getServiceImage(rawService) {
  if (!rawService) return 'assets/images/devotion.png';
  
  // 1. Check custom uploaded override from Admin / Cloud DB
  if (rawService.id && window.VPP_CLOUD_IMAGES && window.VPP_CLOUD_IMAGES[rawService.id]) {
    return window.VPP_CLOUD_IMAGES[rawService.id];
  }
  
  const service = getEffectiveService(rawService);
  if (!service) return 'assets/images/devotion.png';

  // 2. Exact match from SERVICE_IMAGES map
  if (window.SERVICE_IMAGES && window.SERVICE_IMAGES[service.id]) {
    return window.SERVICE_IMAGES[service.id];
  }

  const sId = (service.id || '').toLowerCase();
  const sName = (service.name || '').toLowerCase();

  // 3. Smart Name & Keyword Based Image Resolver (Ensures every pooja matches its exact name!)
  if (sId.includes('akshara') || sName.includes('akshara')) {
    return 'assets/images/aksharabhyasam.jpg';
  }
  if (sId.includes('vara-pashupatham') || sName.includes('vara pashupatham')) {
    return 'assets/images/vara_pashupatham.png';
  }
  if (sId.includes('kanya-pashupatham') || sName.includes('kanya pashupatham')) {
    return 'assets/images/kanya_pashupatham.png';
  }
  if (sId.includes('vijay-pashupatham') || sName.includes('vijaya pashupatham')) {
    return 'assets/images/vijay_pashupatham.png';
  }
  if (sId.includes('aarogya-pashupatham') || sName.includes('aarogya pashupatham')) {
    return 'assets/images/aarogya_pashupatham.png';
  }
  if (sId.includes('dhanvantari-pashupatham') || sName.includes('dhanvantari pashupatham')) {
    return 'assets/images/dhanvantari_pashupatham.png';
  }
  if (sId.includes('kubera-pashupatham') || sName.includes('kubera pashupatham')) {
    return 'assets/images/kubera_pashupatham.png';
  }
  if (sId.includes('kalyanam-pashupatham') || sName.includes('kalyana pashupatham')) {
    return 'assets/images/kalyana_pashupatham.png';
  }
  if (sId.includes('annaprasanam') || sId.includes('onnoprashon') || sId.includes('mukhe-bhaat') || sId.includes('choroonu') || sName.includes('annaprasan') || sName.includes('mukhe bhaat')) {
    return 'assets/images/annaprasanam.png';
  }
  if (sId.includes('barasala') || sId.includes('namakaram') || sId.includes('namkaran') || sId.includes('ekoisia') || sName.includes('naming')) {
    return 'assets/images/barasala.png';
  }
  if (sId.includes('nischitartham') || sId.includes('nirbandha') || sName.includes('engagement') || sName.includes('nischitartham')) {
    return 'assets/images/nischitartham.png';
  }
  if (sId.includes('karna-vedha') || sName.includes('karna vedha') || sName.includes('ear')) {
    return 'assets/images/karna_vedha.png';
  }
  if (sId.includes('seemantham') || sName.includes('seemantham') || sName.includes('baby shower')) {
    return 'assets/images/seemantham.png';
  }
  if (sId.includes('astrologer') || sId.includes('muhurat') || sId.includes('muhurtham') || sId.includes('jyotish') || sName.includes('astrologer')) {
    return 'assets/images/astrologer.png';
  }
  if (sId.includes('rudrabhishekam') || sName.includes('rudra') || sName.includes('shiva') || sName.includes('abhishekam') || sName.includes('linga')) {
    return 'assets/images/rudrabhishekam.png';
  }
  if (sId.includes('satyanarayana') || sName.includes('satyanarayana') || sName.includes('vishnu')) {
    return 'assets/images/satyanarayana_pooja.png';
  }
  if (sId.includes('ganapati') || sId.includes('ganesh') || sName.includes('ganapathi') || sName.includes('ganesh') || sName.includes('vighneshwara')) {
    return 'assets/images/ganapati_pooja.png';
  }
  if (sId.includes('gruhapravesam') || sId.includes('griha') || sName.includes('gruhapravesam') || sName.includes('housewarming') || sName.includes('probesh')) {
    return 'assets/images/gruhapravesam.png';
  }
  if (sId.includes('marriage') || sId.includes('vivah') || sId.includes('sagai') || sId.includes('engagement') || sId.includes('nischitartham') || sName.includes('marriage') || sName.includes('vivah') || sName.includes('wedding')) {
    return 'assets/images/marriage.png';
  }
  if (sId.includes('chandi') || sName.includes('chandi')) {
    return 'assets/images/chandi_homam.png';
  }
  if (sId.includes('varalakshmi') || sId.includes('lakshmi') || sName.includes('lakshmi') || sName.includes('varalakshmi')) {
    return 'assets/images/varalakshmi_vratham.png';
  }
  if (sId.includes('durga') || sId.includes('saraswathi') || sId.includes('devi') || sName.includes('durga') || sName.includes('saraswathi') || sName.includes('devi')) {
    return 'assets/images/devi_default.png';
  }
  if (sId.includes('vastu') || sId.includes('bhoomi') || sName.includes('vastu') || sName.includes('bhoomi') || sName.includes('foundation')) {
    return 'assets/images/vastu_shanti.png';
  }
  if (sId.includes('upanayanam') || sId.includes('upanayan') || sName.includes('upanayanam') || sName.includes('thread')) {
    return 'assets/images/upanayanam.png';
  }
  if (sId.includes('ayudha') || sId.includes('vehicle') || sId.includes('car') || sId.includes('vishwakarma') || sName.includes('ayudha') || sName.includes('vehicle')) {
    return 'assets/images/ayudha_pooja.png';
  }
  if (sId.includes('annaprasanam') || sId.includes('barasala') || sId.includes('namakaran') || sId.includes('seemantham') || sId.includes('noolukettu') || sId.includes('choroonu') || sName.includes('naming') || sName.includes('baby')) {
    return 'assets/images/ceremony.png';
  }
  if (sId.includes('annadanam') || sId.includes('brahmin') || sId.includes('bhojan') || sId.includes('swayampaka') || sId.includes('seedha') || sName.includes('annadanam') || sName.includes('brahmin') || sName.includes('bhojan') || sName.includes('food')) {
    return 'assets/images/brahmin_bhojan.png';
  }
  if (sId.includes('garud') || sName.includes('garud')) {
    return 'assets/images/garud_puran.png';
  }
  if (sId.includes('tarpan') || sName.includes('tarpan')) {
    return 'assets/images/tarpanam.png';
  }
  if (sId.includes('asthi') || sName.includes('asthi') || sName.includes('visarjan')) {
    return 'assets/images/asthi_visarjan.png';
  }
  if (sId.includes('antim') || sName.includes('antim') || sName.includes('last rite')) {
    return 'assets/images/antim_sanskar.png';
  }
  if (sId.includes('shradh') || sId.includes('taddinam') || sId.includes('samvatsarikam') || sId.includes('barsi') || sId.includes('pitru') || sName.includes('shradh') || sName.includes('taddinam') || sName.includes('barsi') || sName.includes('ancestor')) {
    return 'assets/images/shradh_pujan.png';
  }
  if (sId.includes('homam') || sId.includes('havan') || sId.includes('yagna') || sId.includes('jaap') || sId.includes('shanti') || sName.includes('homam') || sName.includes('havan')) {
    return 'assets/images/homam.png';
  }
  
  const fallbacks = {
    ceremony: 'assets/images/ceremony.png',
    pooja: 'assets/images/devotion.png',
    homam: 'assets/images/homam.png',
    shanti: 'assets/images/homam.png',
    parihar: 'assets/images/devotion.png',
    devi: 'assets/images/devi_default.png',
    ancestor: 'assets/images/shradh_pujan.png',
    vratam: 'assets/images/devotion.png',
    festival: 'assets/images/devotion.png'
  };
  
  return fallbacks[service.imageType] || 'assets/images/devotion.png';
}

function init() {
  initDropdowns();
  handleRoute();
  window.addEventListener('hashchange', handleRoute);
  
  window.addEventListener('scroll', () => {
    const header = document.getElementById('main-header');
    if (window.scrollY > 0) {
      header.classList.add('vpp-header--scrolled');
    } else {
      header.classList.remove('vpp-header--scrolled');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.vpp-dropdown').forEach(dropdown => {
        dropdown.classList.remove('vpp-dropdown--open');
      });
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function initDropdowns() {
  const cityBtn = document.getElementById('city-btn');
  const langBtn = document.getElementById('lang-btn');
  const cityDropdown = document.getElementById('city-dropdown');
  const langDropdown = document.getElementById('lang-dropdown');
  const cityMenu = document.getElementById('city-menu');
  const langMenu = document.getElementById('lang-menu');
  const cityText = document.getElementById('city-text');
  const langText = document.getElementById('lang-text');

  // Populate menus
  if (window.APP_DATA && window.APP_DATA.cities) {
    cityMenu.innerHTML = window.APP_DATA.cities.map(city => 
      `<div class="vpp-dropdown__item ${city.id === state.selectedCity ? 'vpp-dropdown__item--active' : ''}" data-value="${city.id}">${city.name}</div>`
    ).join('');
  }

  if (window.APP_DATA && window.APP_DATA.languages) {
    langMenu.innerHTML = window.APP_DATA.languages.map(lang => 
      `<div class="vpp-dropdown__item ${lang.id === state.selectedLanguage ? 'vpp-dropdown__item--active' : ''}" data-value="${lang.id}">${lang.name}</div>`
    ).join('');
  }

  // Toggle dropdowns
  cityBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    langDropdown.classList.remove('vpp-dropdown--open');
    cityDropdown.classList.toggle('vpp-dropdown--open');
  });

  langBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    cityDropdown.classList.remove('vpp-dropdown--open');
    langDropdown.classList.toggle('vpp-dropdown--open');
  });

  // Close dropdowns on outside click
  document.addEventListener('click', () => {
    cityDropdown.classList.remove('vpp-dropdown--open');
    langDropdown.classList.remove('vpp-dropdown--open');
  });

  // Handle item clicks
  cityMenu.addEventListener('click', (e) => {
    const item = e.target.closest('.vpp-dropdown__item');
    if (item) {
      state.selectedCity = item.dataset.value;
      cityText.textContent = item.textContent;
      document.querySelectorAll('#city-menu .vpp-dropdown__item').forEach(el => el.classList.remove('vpp-dropdown__item--active'));
      item.classList.add('vpp-dropdown__item--active');
    }
  });

  langMenu.addEventListener('click', (e) => {
    const item = e.target.closest('.vpp-dropdown__item');
    if (item) {
      state.selectedLanguage = item.dataset.value;
      langText.textContent = item.textContent;
      document.querySelectorAll('#lang-menu .vpp-dropdown__item').forEach(el => el.classList.remove('vpp-dropdown__item--active'));
      item.classList.add('vpp-dropdown__item--active');
      handleRoute();
    }
  });

  const footerCityLinks = document.getElementById('footer-city-links');
  if (footerCityLinks) {
    footerCityLinks.addEventListener('click', (e) => {
      const link = e.target.closest('a[data-city]');
      if (link) {
        const cityId = link.dataset.city;
        state.selectedCity = cityId;
        const cityObj = (window.APP_DATA.cities || []).find(c => c.id === cityId);
        if (cityObj && cityText) {
          cityText.textContent = cityObj.name;
        }
        document.querySelectorAll('#city-menu .vpp-dropdown__item').forEach(el => {
          el.classList.toggle('vpp-dropdown__item--active', el.dataset.value === cityId);
        });
      }
    });
  }
}

function handleRoute() {
  const hash = window.location.hash;
  
  if (hash.startsWith('#/admin')) {
    renderAdmin();
    return;
  } else if (hash === '#/all-services') {
    renderAllServices();
    return;
  } else if (hash === '#/gallery') {
    renderGallery();
    return;
  } else if (hash.startsWith('#/service/')) {
    const parts = hash.split('/');
    if (parts.length === 4) {
      const categoryId = parts[2];
      const serviceId = parts[3];
      renderDetail(categoryId, serviceId);
      return;
    }
  } else if (hash.startsWith('#/category/')) {
    const parts = hash.split('/');
    if (parts.length === 3) {
      const categoryId = parts[2];
      renderCategory(categoryId);
      return;
    }
  }
  
  renderHome();
}

function renderGroupedServices(services, categoryId, langName) {
  const groups = {};
  services.forEach(serv => {
    const grp = serv.group || 'Pujas';
    if (!groups[grp]) groups[grp] = [];
    groups[grp].push(serv);
  });

  const groupIcons = {
    'Pujas': '📿',
    'Ceremonies': '🪔',
    'Havans': '🔥',
    'Festival pujas': '🎊',
    'Jaaps': '📿',
    'Paths': '📖',
    'Shanti pujas': '☮️'
  };

  let html = '';
  for (const groupName in groups) {
    const groupIcon = groupIcons[groupName] || '📿';
    const groupCards = groups[groupName].map(service => {
      const imageUrl = getServiceImage(service);
      return `
        <div class="vpp-service-card slide-up" data-category="${categoryId}" data-service="${service.id}" onclick="window.location.hash='#/service/${categoryId}/${service.id}'">
          <div class="vpp-service-card__image-wrap">
            <img src="${imageUrl}" class="vpp-service-card__img" alt="${service.name}" loading="lazy">
            <div class="vpp-service-card__gradient"></div>
            <span class="vpp-service-card__badge">${service.group || langName + ' Puja'}</span>
          </div>
          <div class="vpp-service-card__body">
            <h3 class="vpp-service-card__title">${service.name}</h3>
            <p class="vpp-service-card__excerpt">${service.shortDesc || ''}</p>
            <div class="vpp-service-card__footer">
              <span class="vpp-service-card__price">₹${service.priceMin ? service.priceMin.toLocaleString('en-IN') : '0'}</span>
              <span class="vpp-service-card__rating">
                <span class="vpp-service-card__stars">${renderStars(service.rating || 0)}</span>
                ${service.rating || 0}
              </span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    html += `
      <div class="vpp-service-group-block" style="margin-bottom: 40px;">
        <div class="vpp-subheader-banner" style="margin-bottom: 20px;">
          <span class="vpp-subheader-title">${groupIcon} ${groupName}</span>
        </div>
        <div class="vpp-services-grid">
          ${groupCards}
        </div>
      </div>
    `;
  }
  return html;
}

function renderHome() {
  state.currentView = 'home';
  document.getElementById('hero-section').classList.remove('hidden');
  document.getElementById('breadcrumb').classList.add('hidden');
  
  if (!window.APP_DATA || !window.APP_DATA.categories) return;

  const content = document.getElementById('app-content');
  
  const currentLang = state.selectedLanguage || 'telugu';
  const langObj = (window.APP_DATA.languages || []).find(l => l.id === currentLang);
  const langName = langObj ? langObj.name : currentLang;

  // Filter categories matching current selected language
  let visibleCategories = window.APP_DATA.categories.filter(c => {
    if (currentLang === 'telugu' || currentLang === 'english') {
      return !c.defaultLanguage || c.defaultLanguage === 'telugu';
    }
    return c.defaultLanguage === currentLang;
  });

  // Fallback if no specific categories defined for selected language yet
  if (visibleCategories.length === 0) {
    visibleCategories = window.APP_DATA.categories.filter(c => !c.defaultLanguage || c.defaultLanguage === 'telugu');
  }

  let categoriesHtml = visibleCategories.map(category => `
    <div class="vpp-category-card slide-up" data-category="${category.id}" onclick="window.location.hash='#/category/${category.id}'">
      <div class="vpp-category-card__icon-wrap" style="background: ${category.gradient}">
        <span class="vpp-category-card__icon">${category.icon}</span>
      </div>
      <div class="vpp-category-card__content">
        <h3 class="vpp-category-card__title">${category.name}</h3>
        <p class="vpp-category-card__count">${category.services ? category.services.length : 0} services</p>
      </div>
      <span class="vpp-category-card__arrow">→</span>
    </div>
  `).join('');

  content.innerHTML = `
    <section class="vpp-section">
      <div class="container">
        <div class="vpp-section__header">
          <div style="display: flex; justify-content: center; margin-bottom: 8px;">
            <span class="vpp-badge--gold">Language: ${langName}</span>
          </div>
          <h2 class="vpp-section__title">${langName} Sacred Categories</h2>
          <p class="vpp-section__subtitle">Explore authentic ${langName} ritual categories performed by certified priests</p>
          
          <!-- Sacred Search Bar Below Telugu Sacred Categories -->
          <div class="vpp-home-search-wrap" style="max-width: 720px; margin: 24px auto 16px; position: relative;">
            <div style="position: relative; display: flex; align-items: center;">
              <span style="position: absolute; left: 18px; font-size: 1.2rem; color: var(--color-gold); pointer-events: none;">🔍</span>
              <input type="text" id="home-sacred-search" placeholder="Search ${langName} categories, rituals (e.g. Rudrabhishekam, Vara Pashupatham, Gruhapravesam, Astrologer)..." style="width: 100%; padding: 14px 44px 14px 50px; border-radius: 50px; border: 2px solid var(--color-gold); background: #FFF; font-size: 1rem; font-family: var(--font-body); box-shadow: var(--shadow-gold); outline: none; transition: all 0.3s ease;">
              <button id="home-search-clear" style="position: absolute; right: 16px; background: rgba(0,0,0,0.1); border: none; border-radius: 50%; width: 24px; height: 24px; font-size: 0.8rem; color: #555; cursor: pointer; display: none; align-items: center; justify-content: center;">✖</button>
            </div>
            
            <div class="vpp-search-tags" style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin-top: 14px;">
              <span class="vpp-search-pill" onclick="window.setHomeSearch('Rudrabhishekam')">🔱 Rudrabhishekam</span>
              <span class="vpp-search-pill" onclick="window.setHomeSearch('Vara Pashupatham')">⚔️ Vara Pashupatham</span>
              <span class="vpp-search-pill" onclick="window.setHomeSearch('Kanya Pashupatham')">🌸 Kanya Pashupatham</span>
              <span class="vpp-search-pill" onclick="window.setHomeSearch('Gruhapravesam')">🪔 Gruhapravesam</span>
              <span class="vpp-search-pill" onclick="window.setHomeSearch('Satyanarayana')">✨ Satyanarayana</span>
              <span class="vpp-search-pill" onclick="window.setHomeSearch('Astrologer')">🔮 Astrologer</span>
              <span class="vpp-search-pill" onclick="window.setHomeSearch('Homam')">🔥 Homam</span>
            </div>
          </div>
        </div>

        <div id="home-search-results-area" style="display: none; margin-bottom: 40px;"></div>

        <div class="vpp-categories-grid" id="home-categories-grid">
          ${categoriesHtml}
        </div>
      </div>
    </section>
  `;
  
  // Attach Home Live Search Listeners
  const searchInput = document.getElementById('home-sacred-search');
  const clearBtn = document.getElementById('home-search-clear');
  
  window.setHomeSearch = function(query) {
    if (searchInput) {
      searchInput.value = query;
      performHomeSearch(query);
    }
  };

  function performHomeSearch(query) {
    const term = query.toLowerCase().trim();
    if (clearBtn) clearBtn.style.display = term ? 'flex' : 'none';

    const categoriesGrid = document.getElementById('home-categories-grid');
    const resultsArea = document.getElementById('home-search-results-area');

    if (!term) {
      if (categoriesGrid) categoriesGrid.style.display = 'grid';
      if (resultsArea) {
        resultsArea.style.display = 'none';
        resultsArea.innerHTML = '';
      }
      return;
    }

    // Filter matching categories and services
    let matchingCategories = visibleCategories.filter(c => c.name.toLowerCase().includes(term) || (c.description && c.description.toLowerCase().includes(term)));
    
    let matchingServices = [];
    visibleCategories.forEach(cat => {
      (cat.services || []).forEach(s => {
        if (s.name.toLowerCase().includes(term) || (s.shortDesc && s.shortDesc.toLowerCase().includes(term)) || (s.description && s.description.toLowerCase().includes(term))) {
          matchingServices.push({ service: s, category: cat });
        }
      });
    });

    if (categoriesGrid) categoriesGrid.style.display = 'none';
    if (resultsArea) {
      resultsArea.style.display = 'block';

      if (matchingCategories.length === 0 && matchingServices.length === 0) {
        resultsArea.innerHTML = `
          <div style="text-align: center; padding: 40px; background: #FFF; border-radius: 12px; border: 1px dashed var(--color-gold);">
            <span style="font-size: 2rem;">🔍</span>
            <h3 style="color: var(--text-dark); margin: 12px 0 6px;">No sacred rituals found for "${query}"</h3>
            <p style="color: var(--text-muted); font-size: 0.9rem;">Try searching for "Rudrabhishekam", "Vara Pashupatham", "Astrologer", or "Homam".</p>
          </div>
        `;
      } else {
        let html = '';
        if (matchingCategories.length > 0) {
          html += `
            <div style="margin-bottom: 24px;">
              <h3 style="font-size: 1.2rem; color: var(--color-saffron); margin-bottom: 12px;">📁 Matching Categories (${matchingCategories.length})</h3>
              <div class="vpp-categories-grid">
                ${matchingCategories.map(cat => `
                  <div class="vpp-category-card" onclick="window.location.hash='#/category/${cat.id}'">
                    <div class="vpp-category-card__icon-wrap" style="background: ${cat.gradient}">
                      <span class="vpp-category-card__icon">${cat.icon}</span>
                    </div>
                    <div class="vpp-category-card__content">
                      <h3 class="vpp-category-card__title">${cat.name}</h3>
                      <p class="vpp-category-card__count">${cat.services ? cat.services.length : 0} services</p>
                    </div>
                    <span class="vpp-category-card__arrow">→</span>
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        }

        if (matchingServices.length > 0) {
          html += `
            <div>
              <h3 style="font-size: 1.2rem; color: var(--color-saffron); margin-bottom: 12px;">📿 Matching Rituals & Services (${matchingServices.length})</h3>
              <div class="vpp-services-grid">
                ${matchingServices.map(m => {
                  const eff = getEffectiveService(m.service);
                  const img = getServiceImage(eff);
                  return `
                    <div class="vpp-service-card slide-up" onclick="window.location.hash='#/service/${m.category.id}/${m.service.id}'">
                      <div class="vpp-service-card__image-wrap">
                        <img src="${img}" class="vpp-service-card__img" alt="${m.service.name}" loading="lazy">
                        <div class="vpp-service-card__gradient"></div>
                        <span class="vpp-service-card__badge">${m.category.name}</span>
                      </div>
                      <div class="vpp-service-card__body">
                        <h3 class="vpp-service-card__title">${m.service.name}</h3>
                        <p class="vpp-service-card__excerpt">${m.service.shortDesc || ''}</p>
                        <div class="vpp-service-card__footer">
                          <span class="vpp-service-card__price">₹${eff.priceMin ? eff.priceMin.toLocaleString('en-IN') : '0'} - ₹${eff.priceMax ? eff.priceMax.toLocaleString('en-IN') : '0'}</span>
                          <span class="vpp-service-card__rating">★ ${m.service.rating || 5.0}</span>
                        </div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }
        resultsArea.innerHTML = html;
      }
    }
  }

  if (searchInput) {
    searchInput.addEventListener('input', (e) => performHomeSearch(e.target.value));
  }
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      performHomeSearch('');
    });
  }

  initScrollObserver();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}


function renderAllServices() {
  state.currentView = 'all-services';
  document.getElementById('hero-section').classList.add('hidden');
  document.getElementById('breadcrumb').classList.remove('hidden');
  
  renderBreadcrumb([
    { label: 'Home', hash: '#/' },
    { label: 'All Rituals', hash: '' }
  ]);
  
  if (!window.APP_DATA || !window.APP_DATA.categories) return;

  const content = document.getElementById('app-content');
  
  const currentLang = state.selectedLanguage || 'telugu';
  const langObj = (window.APP_DATA.languages || []).find(l => l.id === currentLang);
  const langName = langObj ? langObj.name : currentLang;

  let targetCategories = window.APP_DATA.categories.filter(c => {
    if (currentLang === 'telugu' || currentLang === 'english') {
      return !c.defaultLanguage || c.defaultLanguage === 'telugu';
    }
    return c.defaultLanguage === currentLang;
  });

  if (targetCategories.length === 0) {
    targetCategories = window.APP_DATA.categories.filter(c => !c.defaultLanguage || c.defaultLanguage === 'telugu');
  }

  let categoriesHtml = targetCategories.map(category => {
    let servicesListHtml = (category.services || []).map(service => `
      <a href="#/service/${category.id}/${service.id}" class="vpp-all-services__item">
        <span class="vpp-all-services__item-icon">${category.icon}</span>
        <span class="vpp-all-services__item-name">${service.name}</span>
      </a>
    `).join('');
    
    return `
      <div class="vpp-all-services__group slide-up">
        <div class="vpp-all-services__category-header" style="background: ${category.gradient}">
          <span class="vpp-all-services__category-icon">${category.icon}</span>
          <h3 class="vpp-all-services__category-title">${category.name} (${category.services ? category.services.length : 0})</h3>
        </div>
        <div class="vpp-all-services__list">
          ${servicesListHtml}
        </div>
      </div>
    `;
  }).join('');

  content.innerHTML = `
    <section class="vpp-section" style="padding-top: 40px">
      <div class="container">
        <div class="vpp-section__header">
          <h2 class="vpp-section__title">${langName} Sacred Categories</h2>
          <p class="vpp-section__subtitle">Browse all authentic ${langName} services and ceremonies by category</p>
        </div>
        <div class="vpp-all-services-grid">
          ${categoriesHtml}
        </div>
      </div>
    </section>
  `;
  
  initScrollObserver();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function saveCategoryScroll(catId) {
  try {
    sessionStorage.setItem('vpp_scroll_' + catId, String(window.scrollY));
  } catch (e) {}
}
window.saveCategoryScroll = saveCategoryScroll;

function renderCategory(categoryId) {
  state.currentView = 'category';
  document.getElementById('hero-section').classList.add('hidden');
  document.getElementById('breadcrumb').classList.remove('hidden');
  
  const category = findCategory(categoryId);
  if (!category) {
    renderHome();
    return;
  }
  
  state.lastActiveCategory = category.id;
  try {
    sessionStorage.setItem('vpp_last_category', category.id);
  } catch (e) {}

  renderBreadcrumb([
    { label: 'Home', hash: '#/' },
    { label: category.name, hash: '' }
  ]);
  
  const content = document.getElementById('app-content');
  
  let servicesHtml = (category.services || []).map(service => {
    const imageUrl = getServiceImage(service);
    return `
      <div class="vpp-service-card slide-up" data-category="${category.id}" data-service="${service.id}" onclick="saveCategoryScroll('${category.id}'); window.location.hash='#/service/${category.id}/${service.id}'">
        <div class="vpp-service-card__image-wrap">
          <img src="${imageUrl}" class="vpp-service-card__img" alt="${service.name}" loading="lazy">
          <div class="vpp-service-card__gradient"></div>
          <span class="vpp-service-card__badge">${category.name}</span>
        </div>
        <div class="vpp-service-card__body">
          <h3 class="vpp-service-card__title">${service.name}</h3>
          <p class="vpp-service-card__excerpt">${service.shortDesc || ''}</p>
          <div class="vpp-service-card__footer">
            <span class="vpp-service-card__price">₹${service.priceMin ? service.priceMin.toLocaleString('en-IN') : '0'}</span>
            <span class="vpp-service-card__rating">
              <span class="vpp-service-card__stars">${renderStars(service.rating || 0)}</span>
              ${service.rating || 0}
            </span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  let subheaderHtml = category.subheader ? `
    <div class="vpp-subheader-banner">
      <span class="vpp-subheader-title">📿 ${category.subheader}</span>
    </div>
  ` : '';

  content.innerHTML = `
    <section class="vpp-section" style="padding-top: 24px">
      <div class="container">
        <div style="margin-bottom: 16px;">
          <a href="#/all-services" class="vpp-btn" style="background: rgba(212, 175, 55, 0.12); color: var(--color-gold-light); border: 1px solid var(--color-gold); font-size: 0.85rem; padding: 6px 14px; display: inline-flex; align-items: center; gap: 6px; border-radius: 50px; text-decoration: none;">
            ← All Categories
          </a>
        </div>
        <div class="vpp-services">
          <div class="vpp-services__header">
            <h2 class="vpp-services__title">${category.name}</h2>
            <span class="vpp-services__count">${category.services ? category.services.length : 0} services available</span>
          </div>
          ${subheaderHtml}
          <div class="vpp-services-grid">
            ${servicesHtml}
          </div>
        </div>
      </div>
    </section>
  `;
  
  initScrollObserver();
  
  try {
    const savedScroll = sessionStorage.getItem('vpp_scroll_' + category.id);
    if (savedScroll) {
      window.scrollTo({ top: parseInt(savedScroll, 10), behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  } catch (e) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function renderDetail(categoryId, serviceId) {
  state.currentView = 'detail';
  document.getElementById('hero-section').classList.add('hidden');
  document.getElementById('breadcrumb').classList.remove('hidden');
  
  const category = findCategory(categoryId);
  const service = findService(categoryId, serviceId);
  
  if (!service) {
    if (category) {
      window.location.hash = `#/category/${category.id}`;
    } else {
      renderHome();
    }
    return;
  }
  
  const activeCat = category || { id: categoryId, name: 'Category' };
  
  renderBreadcrumb([
    { label: 'Home', hash: '#/' },
    { label: activeCat.name, hash: `#/category/${activeCat.id}` },
    { label: service.name, hash: '' }
  ]);
  
  const content = document.getElementById('app-content');
  const imageUrl = getServiceImage(service);
  
  const insightsHtml = (service.keyInsights || []).map(i => `<li class="vpp-detail__insight-item">${i}</li>`).join('');
  const promiseHtml = (service.promise || []).map(p => `<li class="vpp-detail__promise-item">${p}</li>`).join('');

  const cityObj = (window.APP_DATA.cities || []).find(c => c.id === state.selectedCity);
  const cityName = cityObj ? cityObj.name : (state.selectedCity || 'Hyderabad');
  const waText = encodeURIComponent(`Namaste! Karunakar pandit, I would like to book the ${service.name} service in ${cityName}.`);

  content.innerHTML = `
    <section class="vpp-detail" style="padding-top: 24px">
      <div class="container">
        <div style="margin-bottom: 20px;">
          <a href="#/category/${activeCat.id}" class="vpp-btn" style="background: rgba(212, 175, 55, 0.15); color: var(--color-gold-light); border: 1px solid var(--color-gold); font-size: 0.88rem; padding: 8px 18px; display: inline-flex; align-items: center; gap: 6px; border-radius: 50px; text-decoration: none; cursor: pointer;">
            ← Back to ${activeCat.name}
          </a>
        </div>
        <div class="vpp-detail__grid">
          <div class="vpp-detail__gallery slide-in-left">
            <div class="vpp-detail__img-container">
              <img src="${imageUrl}" class="vpp-detail__img" alt="${service.name}">
            </div>
          </div>
          <div class="vpp-detail__info slide-in-right">
            <span class="vpp-detail__tag">${activeCat.name}</span>
            <h1 class="vpp-detail__title">${service.name}</h1>
            <div class="vpp-detail__rating-row">
              <div class="vpp-detail__stars">${renderDetailStars(service.rating || 0)}</div>
              <span class="vpp-detail__reviews">(${service.reviewCount || 0} customer reviews)</span>
            </div>
            <div class="vpp-detail__price-box">
              <div class="vpp-detail__price-label">Price Range:</div>
              <div class="vpp-detail__price-value">₹${service.priceMin ? service.priceMin.toLocaleString('en-IN') : '0'} - ₹${service.priceMax ? service.priceMax.toLocaleString('en-IN') : '0'}</div>
            </div>
            <p class="vpp-detail__description">${service.description || ''}</p>
            <div class="vpp-detail__section">
              <h3 class="vpp-detail__section-title">✦ Key Insights</h3>
              <ul class="vpp-detail__insights-list">
                ${insightsHtml}
              </ul>
            </div>
            <div class="vpp-detail__section">
              <h3 class="vpp-detail__section-title">🤝 Our Promise</h3>
              <ul class="vpp-detail__promise-list">
                ${promiseHtml}
              </ul>
            </div>
            <div class="vpp-detail__actions">
              <a href="https://wa.me/919014747545?text=${waText}" target="_blank" class="vpp-btn vpp-btn--primary" style="display: inline-flex; align-items: center; justify-content: center; text-decoration: none; box-shadow: var(--shadow-gold);">🪔 Book Now</a>
              <a href="https://wa.me/919014747545?text=${waText}" target="_blank" class="vpp-btn vpp-btn--whatsapp" style="display: inline-flex; align-items: center; justify-content: center; text-decoration: none;">💬 WhatsApp</a>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
  
  initScrollObserver();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderBreadcrumb(items) {
  const list = document.getElementById('breadcrumb-list');
  list.innerHTML = items.map((item, i) => {
    if (i < items.length - 1) {
      return `<li class="vpp-breadcrumb__item"><a href="${item.hash}" class="vpp-breadcrumb__link">${item.label}</a></li>
              <li class="vpp-breadcrumb__separator">›</li>`;
    } else {
      return `<li class="vpp-breadcrumb__item"><span class="vpp-breadcrumb__current">${item.label}</span></li>`;
    }
  }).join('');
}

function renderStars(rating) {
  let stars = '';
  for (let i = 1; i <= 5; i++) {
    if (i <= Math.floor(rating)) stars += '★';
    else if (i - 0.5 <= rating) stars += '★'; 
    else stars += '☆';
  }
  return stars;
}

function renderDetailStars(rating) {
  let html = '';
  for (let i = 1; i <= 5; i++) {
    if (i <= Math.floor(rating)) {
      html += '<span class="vpp-detail__star vpp-detail__star--filled">★</span>';
    } else if (i - 0.5 <= rating) {
      html += '<span class="vpp-detail__star vpp-detail__star--filled">★</span>';
    } else {
      html += '<span class="vpp-detail__star vpp-detail__star--empty">☆</span>';
    }
  }
  return html;
}

function findCategory(categoryId) {
  if (!window.APP_DATA || !window.APP_DATA.categories) return null;
  if (!categoryId) return window.APP_DATA.categories[0] || null;

  // 1. Direct match by ID
  let cat = window.APP_DATA.categories.find(c => c.id === categoryId);
  if (cat) return cat;

  // 2. Base ID match (strip language prefix if any)
  const baseId = categoryId.replace(/^(gujarati|bengali|hindi|marathi|malayalam|odia|tamil|kannada|english|telugu)-/, '');
  cat = window.APP_DATA.categories.find(c => {
    const cBase = c.id.replace(/^(gujarati|bengali|hindi|marathi|malayalam|odia|tamil|kannada|english|telugu)-/, '');
    return cBase === baseId || c.id.includes(baseId) || baseId.includes(c.id);
  });
  if (cat) return cat;

  // 3. Fallback: match first category matching current language
  const currentLang = state.selectedLanguage || 'telugu';
  cat = window.APP_DATA.categories.find(c => {
    if (currentLang === 'telugu' || currentLang === 'english') {
      return !c.defaultLanguage || c.defaultLanguage === 'telugu';
    }
    return c.defaultLanguage === currentLang;
  });

  return cat || window.APP_DATA.categories[0];
}

function findService(categoryId, serviceId) {
  if (!window.APP_DATA || !window.APP_DATA.categories || !serviceId) return null;
  
  // 1. First look inside specified category
  const category = findCategory(categoryId);
  if (category && category.services) {
    const s = category.services.find(serv => serv.id === serviceId);
    if (s) return s;
  }

  // 2. Search across ALL categories for serviceId
  for (const cat of window.APP_DATA.categories) {
    if (cat.services) {
      const s = cat.services.find(serv => serv.id === serviceId);
      if (s) return s;
    }
  }

  // 3. Match base ID across all categories
  const baseServiceId = serviceId.replace(/^(gujarati|bengali|hindi|marathi|malayalam|odia|tamil|kannada|english|telugu)-/, '');
  for (const cat of window.APP_DATA.categories) {
    if (cat.services) {
      const s = cat.services.find(serv => {
        const sBase = serv.id.replace(/^(gujarati|bengali|hindi|marathi|malayalam|odia|tamil|kannada|english|telugu)-/, '');
        return sBase === baseServiceId;
      });
      if (s) return s;
    }
  }

  return null;
}

function getCategoryGradient(imageType) {
  const gradients = {
    ceremony: 'linear-gradient(135deg, #E65100, #FF9933)',
    pooja: 'linear-gradient(135deg, #C41E3A, #FF6B6B)',
    homam: 'linear-gradient(135deg, #FF6B00, #FFA000)',
    shanti: 'linear-gradient(135deg, #2E7D32, #66BB6A)',
    parihar: 'linear-gradient(135deg, #5C0614, #C41E3A)',
    devi: 'linear-gradient(135deg, #7B1FA2, #CE93D8)',
    ancestor: 'linear-gradient(135deg, #4E342E, #8D6E63)',
    vratam: 'linear-gradient(135deg, #1565C0, #42A5F5)',
    festival: 'linear-gradient(135deg, #F9A825, #FFEE58)'
  };
  return gradients[imageType] || gradients.ceremony;
}

function initScrollObserver() {
  if (typeof IntersectionObserver === 'undefined') return;
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

  document.querySelectorAll('.slide-up, .slide-in-left, .slide-in-right').forEach(el => {
    observer.observe(el);
  });
}

function renderGallery() {
  state.currentView = 'gallery';
  document.getElementById('hero-section').classList.add('hidden');
  document.getElementById('breadcrumb').classList.remove('hidden');
  
  renderBreadcrumb([
    { label: 'Home', hash: '#/' },
    { label: 'My Gallery 📸', hash: '' }
  ]);
  
  const content = document.getElementById('app-content');
  const galleryImages = window.MY_GALLERY_IMAGES || [];

  const filterCategories = [
    { id: 'all', name: '✨ All Photos (43+)' },
    { id: 'Rudrabhishekam & Pashupatham', name: '🔱 Rudrabhishekam & Pashupatham' },
    { id: 'Homams & Yagnas', name: '🔥 Homams & Yagnas' },
    { id: 'Sacred Ceremonies', name: '🪔 Sacred Ceremonies' },
    { id: 'Astrologer & Rituals', name: '🔮 Astrologer & Rituals' },
    { id: 'Divine Priests', name: '🕉️ Divine Priests' }
  ];

  let filterButtonsHtml = filterCategories.map((cat, idx) => 
    `<button class="vpp-gallery-filter-btn ${idx === 0 ? 'vpp-gallery-filter-btn--active' : ''}" data-filter="${cat.id}">${cat.name}</button>`
  ).join('');

  function buildGalleryGridHtml(images) {
    return images.map((imgObj, idx) => `
      <div class="vpp-gallery-card-100c slide-up" data-category="${imgObj.category}" data-index="${idx}" onclick="window.openGalleryLightbox(${idx})" style="cursor: pointer;">
        <div class="vpp-gallery-card-100c__image-container" style="height: 280px;">
          <img src="${imgObj.path}" class="vpp-gallery-card-100c__img" alt="Gallery Photo" loading="lazy">
          <div class="vpp-gallery-card-100c__overlay">
            <span style="color: var(--color-gold); font-size: 2.2rem; filter: drop-shadow(0 2px 8px rgba(0,0,0,0.5));">🔍</span>
          </div>
        </div>
      </div>
    `).join('');
  }

  content.innerHTML = `
    <section class="vpp-section vpp-gallery-section" style="padding-top: 30px;">
      <div class="container">
        <div class="vpp-section__header">
          <div style="display: flex; justify-content: center; margin-bottom: 12px;">
             <span class="vpp-badge--gold">👑 LUXURY GALLERY</span>
          </div>
          <h2 class="vpp-section__title">Vedic Pooja Pandit Divine Gallery</h2>
          <p class="vpp-section__subtitle">Browse high-resolution photos of sacred poojas, homams, Pashupatham rituals, and certified Patashala pandits.</p>
        </div>
        
      
        
        <div class="vpp-gallery-100c-grid" id="gallery-grid">
          ${buildGalleryGridHtml(galleryImages)}
        </div>
      </div>
    </section>

    <!-- Fullscreen Lightbox Modal -->
    <div id="vpp-lightbox-modal" class="vpp-lightbox-modal" style="display: none;">
      <div class="vpp-lightbox-backdrop" onclick="window.closeGalleryLightbox()"></div>
      <div class="vpp-lightbox-content">
        <button class="vpp-lightbox-close" onclick="window.closeGalleryLightbox()">✕</button>
        <button class="vpp-lightbox-nav vpp-lightbox-prev" onclick="window.navGalleryLightbox(-1)">❮</button>
        <button class="vpp-lightbox-nav vpp-lightbox-next" onclick="window.navGalleryLightbox(1)">❯</button>
        
        <div class="vpp-lightbox-img-wrap" style="margin-bottom: 0;">
          <img id="lightbox-img" src="" alt="Gallery Image">
        </div>
        
        <div class="vpp-lightbox-info" style="margin-top: 16px;">
          <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
            <a id="lightbox-dl-btn" href="#" download class="vpp-btn vpp-btn--primary" style="padding: 8px 20px; font-size: 0.9rem;">⬇ Download HD Photo</a>
            <a id="lightbox-wa-btn" href="#" target="_blank" class="vpp-btn vpp-btn--whatsapp" style="padding: 8px 20px; font-size: 0.9rem;">💬 Share on WhatsApp</a>
          </div>
        </div>
      </div>
    </div>
  `;

  // Gallery Lightbox Logic
  let currentLightboxIdx = 0;

  window.openGalleryLightbox = function(index) {
    if (index < 0 || index >= galleryImages.length) return;
    currentLightboxIdx = index;
    const imgObj = galleryImages[index];

    const modal = document.getElementById('vpp-lightbox-modal');
    const img = document.getElementById('lightbox-img');
    const dlBtn = document.getElementById('lightbox-dl-btn');
    const waBtn = document.getElementById('lightbox-wa-btn');

    if (img) img.src = imgObj.path;
    if (dlBtn) dlBtn.href = imgObj.path;
    if (waBtn) {
      const waMsg = encodeURIComponent(`Check out this sacred ritual photo from Vedic Pooja Pandit`);
      waBtn.href = `https://wa.me/?text=${waMsg}`;
    }

    if (modal) modal.style.display = 'flex';
  };

  window.closeGalleryLightbox = function() {
    const modal = document.getElementById('vpp-lightbox-modal');
    if (modal) modal.style.display = 'none';
  };

  window.navGalleryLightbox = function(step) {
    let nextIdx = currentLightboxIdx + step;
    if (nextIdx < 0) nextIdx = galleryImages.length - 1;
    if (nextIdx >= galleryImages.length) nextIdx = 0;
    window.openGalleryLightbox(nextIdx);
  };

  // Filter bar listener
  const filterBar = document.getElementById('gallery-filter-bar');
  const grid = document.getElementById('gallery-grid');
  
  if (filterBar && grid) {
    filterBar.addEventListener('click', (e) => {
      const btn = e.target.closest('.vpp-gallery-filter-btn');
      if (!btn) return;
      
      filterBar.querySelectorAll('.vpp-gallery-filter-btn').forEach(b => b.classList.remove('vpp-gallery-filter-btn--active'));
      btn.classList.add('vpp-gallery-filter-btn--active');
      
      const filter = btn.dataset.filter;
      const cards = grid.querySelectorAll('.vpp-gallery-card-100c');
      
      cards.forEach(card => {
        if (filter === 'all' || card.dataset.category === filter) {
          card.style.display = 'flex';
        } else {
          card.style.display = 'none';
        }
      });
    });
  }

  initScrollObserver();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderAdmin() {
  state.currentView = 'admin';
  const hero = document.getElementById('hero-section');
  if (hero) hero.classList.add('hidden');
  
  const breadcrumb = document.getElementById('breadcrumb');
  if (breadcrumb) breadcrumb.classList.remove('hidden');

  const hash = window.location.hash || '#/admin';
  let initialSearch = '';
  let initialCategory = 'all';

  if (hash.includes('/category/')) {
    const parts = hash.split('/');
    if (parts[3]) initialCategory = parts[3];
  } else if (hash.includes('/service/')) {
    const parts = hash.split('/');
    const targetServiceId = parts[parts.length - 1];
    (window.APP_DATA.categories || []).forEach(c => {
      (c.services || []).forEach(s => {
        if (s.id === targetServiceId) {
          initialSearch = s.name;
          initialCategory = c.id;
        }
      });
    });
  }
  
  renderBreadcrumb([
    { label: 'Home', hash: '#/' },
    { label: 'Admin Control Panel', hash: '#/admin' }
  ]);

  const content = document.getElementById('app-content');
  if (!content) return;

  // Check Admin Session Authentication
  let isAuth = false;
  try {
    isAuth = sessionStorage.getItem('vpp_admin_auth') === 'true';
  } catch (e) {
    isAuth = false;
  }

  if (!isAuth) {
    content.innerHTML = `
      <section class="vpp-section" style="padding-top: 40px;">
        <div class="container">
          <div class="vpp-admin-login-card" style="opacity: 1; visibility: visible;">
            <span style="font-size: 3.2rem;">🔐</span>
            <h2 style="color: var(--color-gold); font-size: 1.8rem; margin: 12px 0 6px 0;">Pandit Admin Login</h2>
            <p style="color: rgba(255, 255, 255, 0.8); font-size: 0.9rem; margin-bottom: 24px;">Enter credentials to manage prices and custom images.</p>
            
            <div style="text-align: left; margin-bottom: 16px;">
              <label style="color: var(--color-gold); font-size: 0.8rem; font-weight: 600; margin-bottom: 6px; display: block; letter-spacing: 0.5px;">ADMIN EMAIL</label>
              <input type="email" id="admin-email-input" class="vpp-admin-input" placeholder="byasadevp632@gmail.com" style="margin-bottom: 0;" autofocus>
            </div>

            <div style="text-align: left; margin-bottom: 24px;">
              <label style="color: var(--color-gold); font-size: 0.8rem; font-weight: 600; margin-bottom: 6px; display: block; letter-spacing: 0.5px;">PASSWORD</label>
              <input type="password" id="admin-pass-input" class="vpp-admin-input" placeholder="••••••••" style="margin-bottom: 0;">
            </div>

            <button id="admin-login-btn" class="vpp-btn vpp-btn--primary" style="width: 100%; border: none; padding: 12px; font-weight: 600; font-size: 1rem;">Login to Control Panel</button>
            
            <div id="admin-error-msg" style="color: #FF6B6B; font-size: 0.85rem; margin-top: 16px; display: none; background: rgba(255,0,0,0.15); padding: 10px 14px; border-radius: 6px; border: 1px solid rgba(255,0,0,0.3);">
              ⚠️ Invalid Email or Password! Please try again.
            </div>
          </div>
        </div>
      </section>
    `;

    const loginBtn = document.getElementById('admin-login-btn');
    const emailInput = document.getElementById('admin-email-input');
    const passInput = document.getElementById('admin-pass-input');
    const errorMsg = document.getElementById('admin-error-msg');

    function attemptLogin() {
      const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
      const pass = passInput ? passInput.value : '';

      // Admin Credentials Check: byasadevp632@gmail.com / byasadevp632@2004
      if (email === 'byasadevp632@gmail.com' && pass === 'byasadevp632@2004') {
        sessionStorage.setItem('vpp_admin_auth', 'true');
        renderAdmin();
      } else if (errorMsg) {
        errorMsg.style.display = 'block';
      }
    }

    if (loginBtn) loginBtn.addEventListener('click', attemptLogin);
    if (emailInput) emailInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') attemptLogin(); });
    if (passInput) passInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') attemptLogin(); });

    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  // Admin Authenticated View
  const languagesList = window.APP_DATA.languages || [];
  let currentAdminLang = state.selectedLanguage || 'telugu';
  let currentAdminCategory = initialCategory || 'all';

  function buildAdminUI() {
    let targetCategories = (window.APP_DATA.categories || []).filter(c => {
      if (currentAdminLang === 'telugu' || currentAdminLang === 'english') {
        return !c.defaultLanguage || c.defaultLanguage === 'telugu';
      }
      return c.defaultLanguage === currentAdminLang;
    });

    if (targetCategories.length === 0) {
      targetCategories = (window.APP_DATA.categories || []).filter(c => !c.defaultLanguage || c.defaultLanguage === 'telugu');
    }

    const currentLangObj = languagesList.find(l => l.id === currentAdminLang);
    const langName = currentLangObj ? currentLangObj.name : currentAdminLang;

    // Category cards HTML
    let categoryCardsHtml = targetCategories.map(cat => `
      <div class="vpp-category-card ${currentAdminCategory === cat.id ? 'vpp-category-card--active' : ''}" style="cursor: pointer; ${currentAdminCategory === cat.id ? 'border: 2px solid var(--color-gold); background: rgba(212,175,55,0.15);' : ''}" onclick="window.setAdminCategory('${cat.id}')">
        <div class="vpp-category-card__icon-wrap" style="background: ${cat.gradient}">
          <span class="vpp-category-card__icon">${cat.icon}</span>
        </div>
        <div class="vpp-category-card__content">
          <h3 class="vpp-category-card__title">${cat.name}</h3>
          <p class="vpp-category-card__count">${cat.services ? cat.services.length : 0} services</p>
        </div>
      </div>
    `).join('');

    content.innerHTML = `
      <section class="vpp-section" style="padding-top: 20px;">
        <div class="container">
          <!-- Control Panel Header -->
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; margin-bottom: 24px; background: var(--color-maroon-dark); padding: 20px 24px; border-radius: var(--radius-md); border: 1px solid rgba(212, 175, 55, 0.4);">
            <div>
              <h2 style="color: var(--color-gold); font-size: 1.6rem; margin: 0 0 4px 0;">🔐 Pandit Admin Control Panel</h2>
              <p style="color: rgba(255,255,255,0.8); font-size: 0.9rem; margin: 0;">Manage service prices & upload custom images live to Cloudinary CDN.</p>
            </div>
            <div>
              <button id="admin-logout-btn" class="vpp-btn" style="background: rgba(229, 81, 0, 0.2); color: #FF9800; border: 1px solid #FF9800; font-size: 0.85rem; padding: 8px 16px;">🚪 Logout</button>
            </div>
          </div>

          <!-- Language Selector Bar -->
          <div style="background: #FFF; padding: 16px 20px; border-radius: var(--radius-md); box-shadow: var(--shadow-sm); margin-bottom: 24px; border: 1px solid var(--color-border);">
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 12px;">
              <span style="font-weight: 600; color: var(--text-dark); font-size: 0.95rem;">🌐 SELECT LANGUAGE TO EDIT:</span>
              <span class="vpp-badge--gold">${langName} Selected</span>
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              ${languagesList.map(lang => `
                <button class="vpp-btn ${currentAdminLang === lang.id ? 'vpp-btn--primary' : ''}" style="${currentAdminLang !== lang.id ? 'background: #F0F0F0; color: #333;' : ''} font-size: 0.85rem; padding: 6px 14px;" onclick="window.setAdminLanguage('${lang.id}')">
                  ${lang.name}
                </button>
              `).join('')}
            </div>
          </div>

          <!-- Language Category Cards Overview -->
          <div style="margin-bottom: 32px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <h3 style="font-size: 1.2rem; color: var(--text-dark); margin: 0;">${langName} Categories</h3>
              <button class="vpp-btn" style="font-size: 0.8rem; padding: 4px 12px; background: ${currentAdminCategory === 'all' ? 'var(--color-saffron)' : '#E0E0E0'}; color: ${currentAdminCategory === 'all' ? '#FFF' : '#333'};" onclick="window.setAdminCategory('${currentAdminCategory === 'all' ? '' : 'all'}')">Show All Categories</button>
            </div>
            <div class="vpp-categories-grid">
              ${categoryCardsHtml}
            </div>
          </div>

          <!-- Search & Filter Bar -->
          <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; align-items: center;">
            <input type="text" id="admin-search-input" value="${initialSearch}" placeholder="🔍 Search any pooja by name..." style="flex: 1; min-width: 240px; padding: 10px 16px; border-radius: 4px; border: 1px solid #CCC; font-size: 0.95rem;">
            <span id="admin-services-count" style="font-size: 0.9rem; font-weight: 500; color: var(--text-light);"></span>
          </div>

          <!-- Admin Service Cards Grid -->
          <div id="admin-services-grid" class="vpp-admin-grid"></div>
        </div>
      </section>
    `;

    // Window helper methods for category and language switching
    window.setAdminLanguage = function(langId) {
      currentAdminLang = langId;
      currentAdminCategory = 'all';
      buildAdminUI();
    };

    window.setAdminCategory = function(catId) {
      currentAdminCategory = catId;
      buildAdminUI();
    };

    // Render Grid
    updateAdminGrid();

    // Event listeners
    const searchInput = document.getElementById('admin-search-input');
    if (searchInput) searchInput.addEventListener('input', updateAdminGrid);

    const logoutBtn = document.getElementById('admin-logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        sessionStorage.removeItem('vpp_admin_auth');
        window.location.hash = '#/';
      });
    }
  }

  function updateAdminGrid() {
    const searchEl = document.getElementById('admin-search-input');
    const searchTerm = (searchEl && searchEl.value) ? String(searchEl.value).toLowerCase().trim() : '';

    let categoryList = (window.APP_DATA.categories || []).filter(c => {
      if (currentAdminLang === 'telugu' || currentAdminLang === 'english') {
        return !c.defaultLanguage || c.defaultLanguage === 'telugu';
      }
      return c.defaultLanguage === currentAdminLang;
    });

    if (categoryList.length === 0) {
      categoryList = (window.APP_DATA.categories || []).filter(c => !c.defaultLanguage || c.defaultLanguage === 'telugu');
    }

    if (currentAdminCategory !== 'all') {
      categoryList = categoryList.filter(c => c.id === currentAdminCategory);
    }

    let servicesToDisplay = [];
    categoryList.forEach(cat => {
      (cat.services || []).forEach(serv => {
        if (!searchTerm || serv.name.toLowerCase().includes(searchTerm)) {
          servicesToDisplay.push({
            ...serv,
            categoryId: cat.id,
            categoryName: cat.name,
            categoryIcon: cat.icon
          });
        }
      });
    });

    const countEl = document.getElementById('admin-services-count');
    if (countEl) countEl.textContent = `Showing ${servicesToDisplay.length} Poojas`;

    const gridEl = document.getElementById('admin-services-grid');
    if (!gridEl) return;

    if (servicesToDisplay.length === 0) {
      gridEl.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #666; background: #FFF; border-radius: 8px;">No matching pooja services found for search/filter.</div>`;
      return;
    }

    gridEl.innerHTML = servicesToDisplay.map(s => {
      const eff = getEffectiveService(s);
      const activeImg = getServiceImage(eff);

      return `
        <div class="vpp-admin-card" data-service-id="${s.id}">
          <div class="vpp-admin-card__header">
            <img src="${activeImg}" class="vpp-admin-card__thumb" id="admin-thumb-${s.id}" alt="${s.name}">
            <div>
              <span style="font-size: 0.75rem; background: rgba(230,81,0,0.1); color: var(--color-saffron); padding: 2px 8px; border-radius: 4px; font-weight: 600;">${s.categoryIcon || '📿'} ${s.categoryName}</span>
              <h4 class="vpp-admin-card__title" style="margin-top: 4px;">${s.name}</h4>
            </div>
          </div>

          <!-- Price Range Section -->
          <div style="background: #FFFDF5; padding: 12px; border-radius: 6px; border: 1px solid rgba(212, 175, 55, 0.4); margin-bottom: 12px;">
            <span style="font-size: 0.8rem; font-weight: 600; color: var(--color-saffron); display: block; margin-bottom: 6px;">💰 PRICE RANGE UPDATE (₹):</span>
            <div style="display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap;">
              <div style="display: flex; flex-direction: column; flex: 1; min-width: 90px;">
                <label style="font-size: 0.7rem; color: #666; font-weight: 600; margin-bottom: 2px;">MIN PRICE (₹)</label>
                <input type="number" id="price-min-${s.id}" class="vpp-admin-input vpp-admin-price-input" data-service-id="${s.id}" value="${eff.priceMin !== undefined ? eff.priceMin : ''}" placeholder="${s.priceMin || 0}" style="margin: 0; padding: 6px 8px; font-size: 0.9rem; background: #FFF;">
              </div>
              <div style="display: flex; flex-direction: column; flex: 1; min-width: 90px;">
                <label style="font-size: 0.7rem; color: #666; font-weight: 600; margin-bottom: 2px;">MAX PRICE (₹)</label>
                <input type="number" id="price-max-${s.id}" class="vpp-admin-input vpp-admin-price-input" data-service-id="${s.id}" value="${eff.priceMax !== undefined ? eff.priceMax : ''}" placeholder="${s.priceMax || 0}" style="margin: 0; padding: 6px 8px; font-size: 0.9rem; background: #FFF;">
              </div>
              <button class="vpp-btn vpp-btn--primary admin-price-save-btn" data-service-id="${s.id}" data-orig-min="${s.priceMin || 0}" data-orig-max="${s.priceMax || 0}" style="padding: 8px 12px; font-size: 0.8rem; height: 34px; margin-bottom: 1px;">💾 Save Price</button>
            </div>
            <span style="font-size: 0.72rem; color: #777; margin-top: 4px; display: block;">* Saves instantly while typing! Leave empty to keep existing price intact</span>
          </div>

          <!-- Image Section: Cloudinary Image Upload -->
          <div style="background: #F9F9F9; padding: 12px; border-radius: 6px; border: 1px dashed #DDD; display: flex; flex-direction: column; gap: 8px;">
            <span style="font-size: 0.8rem; font-weight: 600; color: #444;">☁️ UPLOAD CUSTOM IMAGE:</span>
            
            <!-- File Input and Upload Button -->
            <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
              <input type="file" id="imageInput-${s.id}" class="vpp-admin-file-input" data-service-id="${s.id}" accept="image/*" style="display: none;" />
              <button id="uploadButton-${s.id}" class="vpp-btn vpp-btn--primary admin-upload-btn" data-service-id="${s.id}" style="flex: 1; padding: 8px 14px; font-size: 0.85rem; display: flex; align-items: center; justify-content: center; gap: 6px;">
                📱 Mobile Gallery / Camera
              </button>
              <button class="vpp-admin-btn-reset admin-url-btn" data-service-id="${s.id}" style="padding: 8px 12px; font-size: 0.85rem;">🔗 URL Link</button>
            </div>

            <!-- Status Message -->
            <p id="statusMessage-${s.id}" style="margin: 4px 0 0 0; font-size: 0.8rem; font-weight: bold; min-height: 18px;"></p>
          </div>
        </div>
      `;
    }).join('');

    // Instant Price Input Listener (Saves INSTANTLY while typing in input boxes)
    document.querySelectorAll('.vpp-admin-price-input').forEach(input => {
      const handleInstantSave = (e) => {
        const serviceId = e.target.dataset.serviceId;
        const minEl = document.getElementById(`price-min-${serviceId}`);
        const maxEl = document.getElementById(`price-max-${serviceId}`);
        const minValStr = minEl ? minEl.value.trim() : '';
        const maxValStr = maxEl ? maxEl.value.trim() : '';
        
        saveCustomPrice(serviceId, minValStr, maxValStr);
      };

      input.addEventListener('input', handleInstantSave);
      input.addEventListener('change', handleInstantSave);
    });

    // Attach Price Save Listeners
    document.querySelectorAll('.admin-price-save-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const serviceId = e.target.dataset.serviceId;
        const origMin = parseInt(e.target.dataset.origMin, 10) || 0;
        const origMax = parseInt(e.target.dataset.origMax, 10) || 0;
        
        const minEl = document.getElementById(`price-min-${serviceId}`);
        const maxEl = document.getElementById(`price-max-${serviceId}`);
        
        const minValStr = minEl ? minEl.value.trim() : '';
        const maxValStr = maxEl ? maxEl.value.trim() : '';
        
        // Fetch current effective price
        const customP = getCustomPrices()[serviceId] || {};
        const currentEffMin = customP.priceMin !== undefined ? customP.priceMin : origMin;
        const currentEffMax = customP.priceMax !== undefined ? customP.priceMax : origMax;
        
        // Rule: if empty given input then remains same (retains existing value)
        const finalMin = minValStr !== '' ? parseInt(minValStr, 10) : currentEffMin;
        const finalMax = maxValStr !== '' ? parseInt(maxValStr, 10) : currentEffMax;
        
        saveCustomPrice(serviceId, finalMin, finalMax);
        showToast(`💰 Price range saved: ₹${finalMin.toLocaleString('en-IN')} - ₹${finalMax.toLocaleString('en-IN')}`);
      });
    });

    // 1. Click Upload Button -> Opens Mobile Gallery / Laptop File Folder directly
    document.querySelectorAll('.admin-upload-btn').forEach(uploadButton => {
      uploadButton.addEventListener('click', (e) => {
        const serviceId = e.target.dataset.serviceId;
        const imageInput = document.getElementById(`imageInput-${serviceId}`);
        if (imageInput) {
          imageInput.click(); // Opens mobile camera / laptop file browser dialog directly!
        }
      });
    });

    // 2. File Selection Handler -> Automatically uploads selected photo to Cloudinary
    document.querySelectorAll('.vpp-admin-file-input').forEach(imageInput => {
      imageInput.addEventListener('change', async (e) => {
        const serviceId = e.target.dataset.serviceId;
        const uploadButton = document.getElementById(`uploadButton-${serviceId}`);
        const statusMessage = document.getElementById(`statusMessage-${serviceId}`);
        const uploadedImage = document.getElementById(`admin-thumb-${serviceId}`);
        const file = e.target.files[0];

        if (!file) return;

        if (uploadButton) {
          uploadButton.disabled = true;
          uploadButton.textContent = "Uploading...";
        }

        if (statusMessage) {
          statusMessage.textContent = "⏳ Uploading photo live to Cloudinary...";
          statusMessage.style.color = "#E65100";
        }

        // Instant local preview for immediate visual feedback
        compressImageFile(file, (base64Data) => {
          if (uploadedImage) uploadedImage.src = base64Data;
        });

        const formData = new FormData();
        formData.append("file", file);
        formData.append("upload_preset", "vedicpoojapandit");

        try {
          const response = await fetch(
            "https://api.cloudinary.com/v1_1/kqqadx7z/image/upload",
            {
              method: "POST",
              body: formData,
            }
          );

          const data = await response.json();

          if (data.secure_url) {
            if (statusMessage) {
              statusMessage.textContent = "Upload Successful!";
              statusMessage.style.color = "green";
            }

            if (uploadedImage) {
              uploadedImage.src = data.secure_url;
              uploadedImage.style.display = "block";
            }

            saveCustomImage(serviceId, data.secure_url);
            console.log("Success! Image URL:", data.secure_url);
            showToast('☁️ Upload Successful!');
          } else {
            throw new Error(data.error ? data.error.message : "Cloudinary upload error");
          }

        } catch (error) {
          console.error("Error uploading image:", error);
          if (statusMessage) {
            statusMessage.textContent = "Upload failed. Check console for details.";
            statusMessage.style.color = "red";
          }
        } finally {
          if (uploadButton) {
            uploadButton.disabled = false;
            uploadButton.textContent = "📱 Mobile Gallery / Camera";
          }
        }
      });
    });

    // Attach URL Link Button Listener
    document.querySelectorAll('.admin-url-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const serviceId = e.target.dataset.serviceId;
        const url = prompt('Enter custom image URL link:');
        if (url && url.trim()) {
          saveCustomImage(serviceId, url.trim());
          const thumbEl = document.getElementById(`admin-thumb-${serviceId}`);
          if (thumbEl) thumbEl.src = url.trim();
          showToast('✅ Custom image URL saved!');
        }
      });
    });
  }

  buildAdminUI();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

