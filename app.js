const supabaseClient = window.supabase && WISHLIST_CONFIG.supabaseUrl && WISHLIST_CONFIG.supabaseAnonKey
  ? window.supabase.createClient( WISHLIST_CONFIG.supabaseUrl, WISHLIST_CONFIG.supabaseAnonKey )
  : null;
const LOCAL_RESERVATIONS_KEY = "birthday-wishlist-reservations";

const state = {
  gifts: [],
  reservations: [],
  activeFilter: "all",
  selectedGift: null,
  selectedGiftImageIndex: 0,
  loading: false,
  storageMode: "remote"
};

const elements = {
  gifts: document.querySelector( "#gifts" ),
  summary: document.querySelector( "#summary" ),
  emptyState: document.querySelector( "#emptyState" ),
  errorState: document.querySelector( "#errorState" ),
  errorMessage: document.querySelector( "#errorMessage" ),
  retryButton: document.querySelector( "#retryButton" ),
  giftModal: document.querySelector( "#giftModal" ),
  guideModal: document.querySelector( "#guideModal" ),
  participantsModal: document.querySelector( "#participantsModal" ),
  bookingForm: document.querySelector( "#bookingForm" ),
  participantsButton: document.querySelector( "#participantsButton" ),
  confirmBookingButton: document.querySelector( "#confirmBookingButton" ),
  modalMedia: document.querySelector( ".modal-media" ),
  modalImage: document.querySelector( "#modalImage" ),
  imageCarouselControls: document.querySelector( "#imageCarouselControls" ),
  imageCarouselDots: document.querySelector( "#imageCarouselDots" ),
  previousImageButton: document.querySelector( "#previousImageButton" ),
  nextImageButton: document.querySelector( "#nextImageButton" ),
  celebrationLayer: document.querySelector( "#celebrationLayer" ),
  toast: document.querySelector( "#toast" ),
  toastIcon: document.querySelector( "#toastIcon" ),
  toastText: document.querySelector( "#toastText" )
};

let toastTimer = null;
let revealObserver = null;
let celebrationVariantIndex = 0;

const CELEBRATION_PRESETS = [
  {
    key: "hearts",
    symbols: [ "♥", "♡", "💖", "✦" ],
    colors: [ "#ff4fd8", "#ff8ee8", "#ffffff", "#ffd2f6" ],
    motion: "float",
    amount: 16,
    distance: 105,
    lift: 76
  },
  {
    key: "fireworks",
    symbols: [ "✦", "✧", "✷", "✹", "★" ],
    colors: [ "#29f4ff", "#ffd166", "#ffffff", "#9b66ff" ],
    motion: "spark",
    amount: 18,
    distance: 132,
    lift: 34
  },
  {
    key: "gifts",
    symbols: [ "🎁", "🎀", "✦", "♥" ],
    colors: [ "#ffd166", "#ff4fd8", "#29f4ff", "#ffffff" ],
    motion: "gift",
    amount: 14,
    distance: 118,
    lift: 58
  },
  {
    key: "birthday",
    symbols: [ "🎂", "🎈", "🎉", "✧", "♥" ],
    colors: [ "#9dff7a", "#ffd166", "#ff4fd8", "#29f4ff" ],
    motion: "float",
    amount: 17,
    distance: 124,
    lift: 82
  }
];

const CATEGORY_DETAILS = {
  gifts: {
    title: "Подарки",
    eyebrow: "Main wishlist"
  },
  sweets: {
    title: "Сладости",
    eyebrow: "Sweet corner"
  }
};

const CATEGORY_ORDER = [ "gifts", "sweets" ];

function prefersReducedMotion( ) {
  return window.matchMedia( "(prefers-reduced-motion: reduce)" ).matches;
}

function canUseHoverEffects( ) {
  return window.matchMedia( "(hover: hover) and (pointer: fine)" ).matches;
}

function money( value ) {
  if ( value === null || value === undefined || value === "" ) {
    return "Цена не указана";
  }

  return `${Number( value ).toLocaleString( "cs-CZ" )} ${WISHLIST_CONFIG.currency}`;
}

function escapeHtml( value ) {
  const element = document.createElement( "div" );
  element.textContent = value ?? "";
  return element.innerHTML;
}

function normalizeName( value ) {
  return value.trim( ).replace( /\s+/g, " " ).toLocaleLowerCase( "ru-RU" );
}

function getInitials( name ) {
  return name
    .trim( )
    .split( /\s+/ )
    .slice( 0, 2 )
    .map( part => part.charAt( 0 ) )
    .join( "" ) || "?";
}

function readLocalReservations( ) {
  try {
    const saved = JSON.parse( localStorage.getItem( LOCAL_RESERVATIONS_KEY ) || "[]" );
    return Array.isArray( saved ) ? saved : [];
  } catch {
    return [];
  }
}

function writeLocalReservations( reservations ) {
  localStorage.setItem( LOCAL_RESERVATIONS_KEY, JSON.stringify( reservations ) );
}

function createLocalReservation( giftId, guestName ) {
  return {
    id: `local-${Date.now( )}-${Math.random( ).toString( 16 ).slice( 2 )}`,
    gift_id: giftId,
    guest_name: guestName,
    type: "contribution",
    created_at: new Date( ).toISOString( ),
    source: "local"
  };
}

function getGiftReservations( giftId ) {
  return state.reservations.filter( reservation => reservation.gift_id === giftId );
}

function getGiftStatus( gift ) {
  const reservations = getGiftReservations( gift.id );
  const count = reservations.length;

  return {
    type: count > 0 ? "selected" : "available",
    shortLabel: count > 0 ? `Участвуют: ${count}` : "Свободно",
    count,
    reservations
  };
}

function getParticipantText( count ) {
  if ( count === 0 ) {
    return "Пока никто не участвует";
  }

  if ( count === 1 ) {
    return "Участвует 1 человек";
  }

  if ( count >= 2 && count <= 4 ) {
    return `Участвуют ${count} человека`;
  }

  return `Участвуют ${count} человек`;
}

function shouldShowGift( gift ) {
  const count = getGiftReservations( gift.id ).length;

  if ( state.activeFilter === "empty" ) {
    return count === 0;
  }

  if ( state.activeFilter === "selected" ) {
    return count > 0;
  }

  return true;
}

function createAvatarStack( reservations ) {
  if ( reservations.length === 0 ) {
    return '<span class="empty-avatar">♡</span>';
  }

  const visibleReservations = reservations.slice( 0, 3 );
  const avatars = visibleReservations.map( reservation => `<span title="${escapeHtml( reservation.guest_name )}">${escapeHtml( getInitials( reservation.guest_name ) )}</span>` ).join( "" );
  const remainder = reservations.length - visibleReservations.length;
  const remainderAvatar = remainder > 0 ? `<span>+${remainder}</span>` : "";

  return `<div class="avatar-stack" aria-hidden="true">${avatars}${remainderAvatar}</div>`;
}

function getGiftImages( gift ) {
  return Array.isArray( gift.images ) && gift.images.length > 0 ? gift.images : [ gift.image ];
}

function createGiftCard( gift ) {
  const status = getGiftStatus( gift );
  const imageClass = gift.imageFit === "contain" ? " gift-card__image--contain" : "";
  const image = getGiftImages( gift )[0];
  const groupTag = gift.allowGroup ? '<span class="gift-card__group-tag">Можно много</span>' : "";

  return `
    <article class="gift-card">
      <div class="gift-card__media">
        <img class="gift-card__image${imageClass}" src="${escapeHtml( image )}" alt="${escapeHtml( gift.title )}" loading="lazy" />
        <span class="status-badge status-badge--${status.type} gift-card__status">${status.shortLabel}</span>
        ${groupTag}
        <span class="gift-card__price">${money( gift.price )}</span>
      </div>
      <div class="gift-card__body">
        <h3>${escapeHtml( gift.title )}</h3>
        <p class="gift-card__description">${escapeHtml( gift.description )}</p>
        <div class="gift-card__meta">
          ${createAvatarStack( status.reservations )}
          <span>${getParticipantText( status.count )}</span>
        </div>
        <a class="gift-card__shop-link" href="${escapeHtml( gift.link )}" target="_blank" rel="noreferrer">Посмотреть подарок ↗</a>
        <div class="gift-card__actions">
          <button class="card-button" data-open-gift="${escapeHtml( gift.id )}" type="button">Хочу подарить</button>
          <button class="card-secondary-button card-secondary-button--wide" data-show-participants="${escapeHtml( gift.id )}" type="button">Список участников</button>
        </div>
      </div>
    </article>
  `;
}

function renderImageCarouselDots( images ) {
  elements.imageCarouselDots.innerHTML = images.map( ( image, index ) => `
    <button class="image-carousel-dot${index === state.selectedGiftImageIndex ? " image-carousel-dot--active" : ""}" data-carousel-index="${index}" type="button" aria-label="Показать фото ${index + 1}"></button>
  ` ).join( "" );

  elements.imageCarouselDots.querySelectorAll( "[data-carousel-index]" ).forEach( button => {
    button.addEventListener( "click", event => {
      event.stopPropagation( );
      showGiftImage( Number( button.dataset.carouselIndex ) );
    } );
  } );
}

function showGiftImage( index ) {
  const gift = state.selectedGift;

  if ( !gift ) {
    return;
  }

  const images = getGiftImages( gift );
  state.selectedGiftImageIndex = ( index + images.length ) % images.length;
  elements.modalImage.src = images[state.selectedGiftImageIndex];
  elements.modalImage.alt = `${gift.title}, фото ${state.selectedGiftImageIndex + 1}`;
  renderImageCarouselDots( images );
}

function setupGiftImageCarousel( gift ) {
  const images = getGiftImages( gift );
  state.selectedGiftImageIndex = 0;
  elements.modalMedia.classList.toggle( "modal-media--contain", gift.imageFit === "contain" );
  elements.imageCarouselControls.hidden = images.length <= 1;
  showGiftImage( 0 );
}

function getCategoryDetails( category ) {
  return CATEGORY_DETAILS[category] || {
    title: "Ещё идеи",
    eyebrow: "Wishlist"
  };
}

function createGiftSection( category, gifts ) {
  const details = getCategoryDetails( category );

  return `
    <section class="gift-category gift-category--${escapeHtml( category )}">
      <div class="gift-category__heading">
        <div>
          <span class="eyebrow">${escapeHtml( details.eyebrow )}</span>
          <h3>${escapeHtml( details.title )}</h3>
        </div>
        ${details.description ? `<p>${escapeHtml( details.description )}</p>` : ""}
      </div>
      <div class="gift-grid">
        ${gifts.map( createGiftCard ).join( "" )}
      </div>
    </section>
  `;
}

function renderSummary( ) {
  const selectedGifts = state.gifts.filter( gift => getGiftReservations( gift.id ).length > 0 ).length;
  const totalParticipants = state.reservations.length;
  const sweetsCount = state.gifts.filter( gift => gift.category === "sweets" ).length;

  elements.summary.innerHTML = `
    <span class="summary-pill summary-pill--selected">Выбрано: ${selectedGifts}</span>
    <span class="summary-pill summary-pill--people">Участников: ${totalParticipants}</span>
    <span class="summary-pill summary-pill--sweets">Сладостей: ${sweetsCount}</span>
  `;

}

function renderGifts( ) {
  const filteredGifts = state.gifts.filter( shouldShowGift );
  const categories = CATEGORY_ORDER
    .filter( category => filteredGifts.some( gift => ( gift.category || "gifts" ) === category ) );
  const extraCategories = [ ...new Set( filteredGifts.map( gift => gift.category || "gifts" ) ) ]
    .filter( category => !categories.includes( category ) );
  const orderedCategories = [ ...categories, ...extraCategories ];

  elements.gifts.innerHTML = orderedCategories
    .map( category => createGiftSection(
      category,
      filteredGifts.filter( gift => ( gift.category || "gifts" ) === category )
    ) )
    .join( "" );
  elements.gifts.setAttribute( "aria-busy", "false" );
  elements.emptyState.hidden = filteredGifts.length > 0;
  elements.errorState.hidden = true;
  renderSummary( );

  document.querySelectorAll( "[data-open-gift]" ).forEach( button => {
    button.addEventListener( "click", () => openGiftModal( button.dataset.openGift, button ) );
  } );

  document.querySelectorAll( "[data-show-participants]" ).forEach( button => {
    button.addEventListener( "click", () => openParticipantsForGift( button.dataset.showParticipants ) );
  } );

  observeRevealElements( elements.gifts );
  attachMagneticTargets( elements.gifts );
}

function renderError( message ) {
  elements.gifts.innerHTML = "";
  elements.gifts.setAttribute( "aria-busy", "false" );
  elements.emptyState.hidden = true;
  elements.errorState.hidden = false;
  elements.errorMessage.textContent = message;
}

function updateGiftStatusText( status ) {
  document.querySelector( "#giftStatusTitle" ).textContent = getParticipantText( status.count );
  document.querySelector( "#giftStatusText" ).textContent = status.count > 0
    ? "Ты тоже можешь присоединиться. Если кто-то передумает, имя можно удалить в списке участников."
    : "Будь первой, кто выберет этот подарок. Другие люди смогут присоединиться позже.";
}

function openGiftModal( giftId ) {
  const gift = state.gifts.find( item => item.id === giftId );

  if ( !gift ) {
    return;
  }

  const status = getGiftStatus( gift );

  state.selectedGift = gift;
  elements.bookingForm.reset( );
  setupGiftImageCarousel( gift );
  document.querySelector( "#modalTitle" ).textContent = gift.title;
  document.querySelector( "#modalDescription" ).textContent = gift.description;
  document.querySelector( "#modalPrice" ).textContent = money( gift.price );
  document.querySelector( "#modalLink" ).href = gift.link;
  document.querySelector( "#modalBadge" ).textContent = status.shortLabel;
  document.querySelector( "#modalBadge" ).className = `status-badge status-badge--${status.type} modal-media__badge`;
  updateGiftStatusText( status );

  elements.participantsButton.textContent = status.count > 0 ? `Список участников (${status.count})` : "Список участников";
  elements.giftModal.showModal( );
  window.setTimeout( () => document.querySelector( "#guestName" ).focus( ), 80 );
}

async function loadGifts( ) {
  if ( Array.isArray( window.WISHLIST_GIFTS ) ) {
    state.gifts = window.WISHLIST_GIFTS;
    return;
  }

  const response = await fetch( `gifts.json?version=${Date.now( )}` );

  if ( !response.ok ) {
    throw new Error( "Не удалось загрузить список подарков." );
  }

  const gifts = await response.json( );

  if ( !Array.isArray( gifts ) ) {
    throw new Error( "Файл gifts.json заполнен неправильно." );
  }

  state.gifts = gifts;
}

async function loadReservations( ) {
  const localReservations = readLocalReservations( );

  if ( !supabaseClient ) {
    state.storageMode = "local";
    state.reservations = localReservations;
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from( "wishlist_reservations" )
      .select( "*" )
      .order( "created_at", { ascending: true } );

    if ( error ) {
      throw error;
    }

    state.storageMode = "remote";
    state.reservations = [ ...( data || [] ), ...localReservations ];
  } catch ( error ) {
    console.warn( "Supabase unavailable, using local reservations.", error );
    state.storageMode = "local";
    state.reservations = localReservations;
  }
}

function hasSameGuest( giftId, guestName ) {
  const normalizedName = normalizeName( guestName );

  return getGiftReservations( giftId ).some( reservation => normalizeName( reservation.guest_name ) === normalizedName );
}

function setButtonLoading( button, loading, loadingText ) {
  if ( loading ) {
    button.dataset.originalText = button.textContent;
    button.textContent = loadingText;
    button.disabled = true;
    button.classList.add( "button-loading" );
    return;
  }

  button.textContent = button.dataset.originalText || button.textContent;
  button.disabled = false;
  button.classList.remove( "button-loading" );
}

function getCelebrationPreset( presetName ) {
  if ( presetName ) {
    return CELEBRATION_PRESETS.find( preset => preset.key === presetName ) || CELEBRATION_PRESETS[0];
  }

  const preset = CELEBRATION_PRESETS[celebrationVariantIndex % CELEBRATION_PRESETS.length];
  celebrationVariantIndex += 1;
  return preset;
}

function createClickOrigin( x, y ) {
  return {
    getBoundingClientRect( ) {
      return {
        left: x,
        top: y,
        width: 0,
        height: 0
      };
    }
  };
}

function emitCelebrationRing( layer, x, y, color, delay = 0 ) {
  const ring = document.createElement( "span" );
  ring.className = "celebration-ring";
  ring.style.setProperty( "--x", `${x}px` );
  ring.style.setProperty( "--y", `${y}px` );
  ring.style.setProperty( "--c", color );
  ring.style.setProperty( "--delay", `${delay}ms` );
  layer.appendChild( ring );
  ring.addEventListener( "animationend", () => ring.remove( ), { once: true } );
}

function emitCelebrationWave( layer, x, y, preset, options, waveIndex ) {
  const amount = Math.round( ( options.amount || preset.amount ) * ( waveIndex === 0 ? 1 : 0.72 ) );
  const distanceBase = ( options.distance || preset.distance ) + waveIndex * 26;
  const symbols = options.symbols || preset.symbols;
  const colors = preset.colors;

  if ( options.ring !== false ) {
    emitCelebrationRing( layer, x, y, colors[waveIndex % colors.length], waveIndex * 115 );
  }

  for ( let index = 0; index < amount; index += 1 ) {
    const particle = document.createElement( "span" );
    const angle = ( index / amount ) * Math.PI * 2 + Math.random( ) * 0.72;
    const distance = distanceBase * ( 0.45 + Math.random( ) * 0.72 );
    const size = 13 + Math.random( ) * ( options.grand ? 22 : 15 );
    const duration = 980 + Math.random( ) * 650 + waveIndex * 140;

    particle.className = `celebration-particle celebration-particle--${preset.motion}`;
    particle.textContent = symbols[Math.floor( Math.random( ) * symbols.length )];
    particle.style.setProperty( "--x", `${x}px` );
    particle.style.setProperty( "--y", `${y}px` );
    particle.style.setProperty( "--dx", `${Math.cos( angle ) * distance}px` );
    particle.style.setProperty( "--dy", `${Math.sin( angle ) * distance - preset.lift - waveIndex * 18}px` );
    particle.style.setProperty( "--r", `${-220 + Math.random( ) * 440}deg` );
    particle.style.setProperty( "--s", `${size}px` );
    particle.style.setProperty( "--d", `${duration}ms` );
    particle.style.setProperty( "--c", colors[Math.floor( Math.random( ) * colors.length )] );
    particle.style.setProperty( "--delay", `${waveIndex * 95 + Math.random( ) * 45}ms` );
    layer.appendChild( particle );
    particle.addEventListener( "animationend", () => particle.remove( ), { once: true } );
  }
}

function burst( originElement, options = {} ) {
  if ( prefersReducedMotion( ) ) {
    return;
  }

  const layer = elements.celebrationLayer;
  const preset = getCelebrationPreset( options.preset );
  const rect = originElement?.getBoundingClientRect?.( );
  const x = options.x ?? ( rect ? rect.left + rect.width / 2 : window.innerWidth / 2 );
  const y = options.y ?? ( rect ? rect.top + rect.height / 2 : window.innerHeight / 2 );
  const waves = options.waves || ( options.grand ? 3 : 1 );
  const waveDelay = options.waveDelay || 140;

  for ( let waveIndex = 0; waveIndex < waves; waveIndex += 1 ) {
    window.setTimeout(
      () => emitCelebrationWave( layer, x, y - waveIndex * 8, preset, options, waveIndex ),
      waveIndex * waveDelay
    );
  }
}

function emitTrail( x, y, amount = 5 ) {
  if ( prefersReducedMotion( ) ) {
    return;
  }

  const colors = [ "#29f4ff", "#ff4fd8", "#9b66ff", "#9dff7a" ];

  for ( let index = 0; index < amount; index += 1 ) {
    const spark = document.createElement( "span" );
    spark.className = "spark-trail";
    spark.style.setProperty( "--x", `${x}px` );
    spark.style.setProperty( "--y", `${y}px` );
    spark.style.setProperty( "--dx", `${-18 + Math.random( ) * 36}px` );
    spark.style.setProperty( "--dy", `${-22 + Math.random( ) * 18}px` );
    spark.style.setProperty( "--c", colors[Math.floor( Math.random( ) * colors.length )] );
    elements.celebrationLayer.appendChild( spark );
    spark.addEventListener( "animationend", () => spark.remove( ), { once: true } );
  }
}

function createButtonRipple( event ) {
  if ( prefersReducedMotion( ) ) {
    return;
  }

  const button = event.currentTarget;
  const rect = button.getBoundingClientRect( );
  const clientX = event.clientX || rect.left + rect.width / 2;
  const clientY = event.clientY || rect.top + rect.height / 2;
  const ripple = document.createElement( "span" );
  ripple.className = "button-ripple";
  ripple.style.left = `${clientX - rect.left}px`;
  ripple.style.top = `${clientY - rect.top}px`;
  button.appendChild( ripple );
  ripple.addEventListener( "animationend", () => ripple.remove( ), { once: true } );
}

function triggerClickCelebration( event ) {
  if ( event.target.closest( "input, textarea, select" ) ) {
    return;
  }

  const clickable = event.target.closest( "button, a, [role='button']" );
  const disabled = clickable?.disabled || clickable?.getAttribute( "aria-disabled" ) === "true";
  const origin = clickable && !disabled ? clickable : createClickOrigin( event.clientX, event.clientY );
  const isGiftAction = clickable?.matches( ".card-button, #confirmBookingButton, [data-open-gift]" );
  const isTinyAction = clickable?.matches( ".icon-button, .participant-remove" );
  const shouldAnimateControl = clickable?.matches( "button, .primary-button, .secondary-button, .card-button, .card-secondary-button, .secondary-action-button" );

  if ( shouldAnimateControl && !disabled ) {
    createButtonRipple( { currentTarget: clickable, clientX: event.clientX, clientY: event.clientY } );
    clickable.classList.add( "button-pop" );
    clickable.addEventListener( "animationend", () => clickable.classList.remove( "button-pop" ), { once: true } );
  }

  burst( origin, {
    amount: isGiftAction ? 20 : isTinyAction ? 9 : clickable ? 13 : 8,
    distance: isGiftAction ? 132 : isTinyAction ? 74 : clickable ? 96 : 62,
    ring: Boolean( clickable )
  } );
}

function setupRevealObserver( ) {
  if ( prefersReducedMotion( ) ) {
    document.querySelectorAll( ".revealable" ).forEach( element => element.classList.add( "reveal-in" ) );
    return;
  }

  revealObserver = new IntersectionObserver( entries => {
    entries.forEach( entry => {
      if ( entry.isIntersecting ) {
        entry.target.classList.add( "reveal-in" );
        revealObserver.unobserve( entry.target );
      }
    } );
  }, {
    rootMargin: "0px 0px -8% 0px",
    threshold: 0.12
  } );
}

function observeRevealElements( root = document ) {
  const targets = root.querySelectorAll( ".gift-card, .gift-category__heading, .section-heading, .filter-bar, .empty-state, .error-state" );

  targets.forEach( ( element, index ) => {
    element.classList.add( "revealable" );
    element.style.transitionDelay = `${Math.min( index * 55, 220 )}ms`;

    if ( prefersReducedMotion( ) || !revealObserver ) {
      element.classList.add( "reveal-in" );
      return;
    }

    revealObserver.observe( element );
  } );
}

function setupCardSpotlight( ) {
  if ( prefersReducedMotion( ) || !canUseHoverEffects( ) ) {
    return;
  }

  elements.gifts.addEventListener( "pointermove", event => {
    const card = event.target.closest( ".gift-card" );

    if ( !card ) {
      return;
    }

    const rect = card.getBoundingClientRect( );
    card.style.setProperty( "--mx", `${event.clientX - rect.left}px` );
    card.style.setProperty( "--my", `${event.clientY - rect.top}px` );
  } );
}

function setupHeroTilt( ) {
  const hero = document.querySelector( ".hero" );
  const stage = document.querySelector( ".hero-stage" );

  if ( !hero || !stage || prefersReducedMotion( ) || !canUseHoverEffects( ) ) {
    return;
  }

  hero.addEventListener( "pointermove", event => {
    const rect = hero.getBoundingClientRect( );
    const x = ( event.clientX - rect.left ) / rect.width;
    const y = ( event.clientY - rect.top ) / rect.height;
    const tiltX = ( 0.5 - y ) * 5;
    const tiltY = ( x - 0.5 ) * 7;

    hero.style.setProperty( "--hero-x", `${x * 100}%` );
    hero.style.setProperty( "--hero-y", `${y * 100}%` );
    stage.style.transform = `rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
  } );

  hero.addEventListener( "pointerleave", () => {
    hero.style.setProperty( "--hero-x", "68%" );
    hero.style.setProperty( "--hero-y", "32%" );
    stage.style.transform = "";
  } );
}

function attachMagneticTargets( root = document ) {
  return;
}

async function addReservation( event ) {
  event.preventDefault( );

  const gift = state.selectedGift;
  const guestName = document.querySelector( "#guestName" ).value.trim( );

  if ( !gift || !guestName ) {
    showToast( "Введи имя, чтобы продолжить.", "error" );
    return;
  }

  setButtonLoading( elements.confirmBookingButton, true, "Сохраняю..." );

  try {
    await loadReservations( );

    if ( hasSameGuest( gift.id, guestName ) ) {
      throw new Error( "Это имя уже участвует в этом подарке." );
    }

    let savedLocally = state.storageMode === "local";

    if ( state.storageMode === "remote" && supabaseClient ) {
      const { error } = await supabaseClient
        .from( "wishlist_reservations" )
        .insert( {
          gift_id: gift.id,
          guest_name: guestName,
          type: "contribution"
        } );

      if ( error ) {
        savedLocally = true;
      }
    }

    if ( savedLocally ) {
      const localReservations = readLocalReservations( );
      localReservations.push( createLocalReservation( gift.id, guestName ) );
      writeLocalReservations( localReservations );
      state.reservations = localReservations;
      state.storageMode = "local";
    } else {
      await loadReservations( );
    }

    burst( elements.confirmBookingButton, {
      preset: "birthday",
      amount: 58,
      distance: 238,
      grand: true,
      waves: 3,
      waveDelay: 135
    } );
    elements.confirmBookingButton.classList.add( "button-success" );
    window.setTimeout( () => elements.confirmBookingButton.classList.remove( "button-success" ), 900 );
    renderGifts( );
    elements.giftModal.close( );
    showToast( "Готово! Ты участвуешь <3" );
  } catch ( error ) {
    showToast( error.message, "error" );
  } finally {
    setButtonLoading( elements.confirmBookingButton, false );
  }
}

function selectGift( giftId ) {
  const gift = state.gifts.find( item => item.id === giftId );

  if ( !gift ) {
    return false;
  }

  state.selectedGift = gift;
  return true;
}

function openParticipantsForGift( giftId ) {
  if ( !selectGift( giftId ) ) {
    return;
  }

  openParticipantsModal( );
}

function renderParticipantsList( ) {
  const gift = state.selectedGift;
  const listElement = document.querySelector( "#participantsList" );

  if ( !gift ) {
    return;
  }

  const reservations = getGiftReservations( gift.id );
  document.querySelector( "#participantsGiftTitle" ).textContent = gift.title;

  listElement.innerHTML = reservations.length > 0
    ? reservations.map( reservation => `
        <li class="participant-item">
          <span class="participant-avatar">${escapeHtml( getInitials( reservation.guest_name ) )}</span>
          <span class="participant-name">${escapeHtml( reservation.guest_name )}</span>
          <button class="participant-remove" data-remove-reservation="${escapeHtml( reservation.id )}" type="button" aria-label="Удалить ${escapeHtml( reservation.guest_name )}">×</button>
        </li>
      ` ).join( "" )
    : '<li class="participant-empty">Пока никто не выбрал этот подарок</li>';

  document.querySelectorAll( "[data-remove-reservation]" ).forEach( button => {
    button.addEventListener( "click", () => removeReservation( button.dataset.removeReservation, button ) );
  } );
}

function openParticipantsModal( ) {
  renderParticipantsList( );

  if ( elements.giftModal.open ) {
    elements.giftModal.close( );
  }

  elements.participantsModal.showModal( );
}

async function removeReservation( reservationId, button ) {
  const reservation = state.reservations.find( item => item.id === reservationId );

  if ( !reservation ) {
    return;
  }

  setButtonLoading( button, true, "×" );

  try {
    if ( reservation.source === "local" || reservation.id.startsWith( "local-" ) ) {
      const updated = readLocalReservations( ).filter( item => item.id !== reservation.id );
      writeLocalReservations( updated );
    } else if ( supabaseClient ) {
      const { error } = await supabaseClient
        .from( "wishlist_reservations" )
        .delete( )
        .eq( "id", reservation.id );

      if ( error ) {
        throw new Error( "Не получилось удалить участника. Попробуй ещё раз." );
      }
    }

    await loadReservations( );
    renderGifts( );
    renderParticipantsList( );
    showToast( "Участник удалён." );
  } catch ( error ) {
    showToast( error.message, "error" );
  } finally {
    setButtonLoading( button, false );
  }
}

async function refresh( ) {
  await loadReservations( );
  renderGifts( );
}

function showToast( message, type = "success" ) {
  window.clearTimeout( toastTimer );
  elements.toastText.textContent = message;
  elements.toastIcon.textContent = type === "error" ? "!" : "✓";
  elements.toast.classList.toggle( "toast--error", type === "error" );
  elements.toast.classList.add( "toast--visible" );
  toastTimer = window.setTimeout( () => elements.toast.classList.remove( "toast--visible" ), 3200 );
}

function closeDialog( dialogId ) {
  const dialog = document.querySelector( `#${dialogId}` );

  if ( dialog?.open ) {
    dialog.close( );
  }
}

async function loadPage( ) {
  if ( state.loading ) {
    return;
  }

  state.loading = true;
  elements.errorState.hidden = true;
  elements.gifts.setAttribute( "aria-busy", "true" );

  try {
    if ( state.gifts.length === 0 ) {
      await loadGifts( );
    }

    await refresh( );
  } catch ( error ) {
    renderError( error.message );
  } finally {
    state.loading = false;
  }
}

function bindEvents( ) {
  document.querySelectorAll( ".filter-button" ).forEach( button => {
    button.addEventListener( "click", event => {
      document.querySelectorAll( ".filter-button" ).forEach( item => item.classList.remove( "filter-button--active" ) );
      button.classList.add( "filter-button--active" );
      state.activeFilter = button.dataset.filter;
      renderGifts( );
    } );
  } );

  document.addEventListener( "click", event => {
    triggerClickCelebration( event );
  } );

  elements.bookingForm.addEventListener( "submit", addReservation );
  elements.participantsButton.addEventListener( "click", openParticipantsModal );
  elements.previousImageButton.addEventListener( "click", event => {
    event.stopPropagation( );
    showGiftImage( state.selectedGiftImageIndex - 1 );
  } );
  elements.nextImageButton.addEventListener( "click", event => {
    event.stopPropagation( );
    showGiftImage( state.selectedGiftImageIndex + 1 );
  } );
  document.querySelector( "#openGuideButtonHero" ).addEventListener( "click", () => elements.guideModal.showModal( ) );
  elements.retryButton.addEventListener( "click", loadPage );

  document.querySelectorAll( "[data-close-dialog]" ).forEach( button => {
    button.addEventListener( "click", () => closeDialog( button.dataset.closeDialog ) );
  } );

  document.querySelectorAll( "dialog" ).forEach( dialog => {
    dialog.addEventListener( "click", event => {
      if ( event.target === dialog ) {
        dialog.close( );
      }
    } );
  } );
}

function init( ) {
  setupRevealObserver( );
  bindEvents( );
  observeRevealElements( document );
  attachMagneticTargets( document );
  setupCardSpotlight( );
  setupHeroTilt( );
  loadPage( );
}

init( );
