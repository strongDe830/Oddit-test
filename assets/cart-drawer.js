class CartDrawer extends HTMLElement {
  constructor() {
    super();

    this.addEventListener('keyup', (evt) => evt.code === 'Escape' && this.close());
    this.querySelector('#CartDrawer-Overlay').addEventListener('click', this.close.bind(this));
    this.setHeaderCartIconAccessibility();
  }

  setHeaderCartIconAccessibility() {
    const cartLink = document.querySelector('#cart-icon-bubble');
    if (!cartLink) return;

    cartLink.setAttribute('role', 'button');
    cartLink.setAttribute('aria-haspopup', 'dialog');
    cartLink.addEventListener('click', (event) => {
      event.preventDefault();
      this.open(cartLink);
    });
    cartLink.addEventListener('keydown', (event) => {
      if (event.code.toUpperCase() === 'SPACE') {
        event.preventDefault();
        this.open(cartLink);
      }
    });
  }

  open(triggeredBy) {
    if (triggeredBy) this.setActiveElement(triggeredBy);
    const cartDrawerNote = this.querySelector('[id^="Details-"] summary');
    if (cartDrawerNote && !cartDrawerNote.hasAttribute('role')) this.setSummaryAccessibility(cartDrawerNote);
    setTimeout(() => {
      this.classList.add('animate', 'active');
    });

    this.addEventListener(
      'transitionend',
      () => {
        const containerToTrapFocusOn = this.classList.contains('is-empty')
          ? this.querySelector('.drawer__inner-empty')
          : document.getElementById('CartDrawer');
        const focusElement = this.querySelector('.drawer__inner') || this.querySelector('.drawer__close');
        trapFocus(containerToTrapFocusOn, focusElement);
      },
      { once: true }
    );

    document.body.classList.add('overflow-hidden');
  }

  close() {
    this.classList.remove('active');
    removeTrapFocus(this.activeElement);
    document.body.classList.remove('overflow-hidden');
  }

  setSummaryAccessibility(cartDrawerNote) {
    cartDrawerNote.setAttribute('role', 'button');
    cartDrawerNote.setAttribute('aria-expanded', 'false');

    if (cartDrawerNote.nextElementSibling.getAttribute('id')) {
      cartDrawerNote.setAttribute('aria-controls', cartDrawerNote.nextElementSibling.id);
    }

    cartDrawerNote.addEventListener('click', (event) => {
      event.currentTarget.setAttribute('aria-expanded', !event.currentTarget.closest('details').hasAttribute('open'));
    });

    cartDrawerNote.parentElement.addEventListener('keyup', onKeyUpEscape);
  }

  renderContents(parsedState) {
    this.querySelector('.drawer__inner').classList.contains('is-empty') &&
      this.querySelector('.drawer__inner').classList.remove('is-empty');
    this.productId = parsedState.id;
    this.getSectionsToRender().forEach((section) => {
      const sectionElement = section.selector
        ? document.querySelector(section.selector)
        : document.getElementById(section.id);

      if (!sectionElement) return;
      sectionElement.innerHTML = this.getSectionInnerHTML(parsedState.sections[section.id], section.selector);
    });

    setTimeout(() => {
      this.querySelector('#CartDrawer-Overlay').addEventListener('click', this.close.bind(this));
      this.open();
      document.dispatchEvent(new Event('cart:updated'));
    });
  }

  getSectionInnerHTML(html, selector = '.shopify-section') {
    return new DOMParser().parseFromString(html, 'text/html').querySelector(selector).innerHTML;
  }

  getSectionsToRender() {
    return [
      {
        id: 'cart-drawer',
        selector: '#CartDrawer',
      },
      {
        id: 'cart-icon-bubble',
      },
    ];
  }

  getSectionDOM(html, selector = '.shopify-section') {
    return new DOMParser().parseFromString(html, 'text/html').querySelector(selector);
  }

  setActiveElement(element) {
    this.activeElement = element;
  }

}
customElements.define('cart-drawer', CartDrawer);



class CartDrawerItems extends CartItems {
  getSectionsToRender() {
    return [
      {
        id: 'CartDrawer',
        section: 'cart-drawer',
        selector: '.drawer__inner',
      },
      {
        id: 'cart-icon-bubble',
        section: 'cart-icon-bubble',
        selector: '.shopify-section',
      },
    ];
  }
}

customElements.define('cart-drawer-items', CartDrawerItems);

class ComprehensiveCartRecommendations extends HTMLElement {
  constructor() {
      super();
  }

  parseWeight(value, defaultValue) {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? defaultValue : parsed;
  }

  connectedCallback() {
      try {
          const cartItemsString = this.dataset.cartItems.replace(/&quot;/g, '"');
          this.cartItems = JSON.parse(cartItemsString);
          this.combinedCartItems = this.combineVariants(this.cartItems);
          this.maxPosition = parseInt(this.dataset.maxPosition, 10) || 4;
          this.productsToShow = parseInt(this.dataset.productsToShow, 10) || this.maxPosition;
      } catch (e) {
          this.cartItems = [];
          this.combinedCartItems = [];
          this.maxPosition = 4;
          this.productsToShow = 4;
      }
  
      if (this.combinedCartItems.length > 0) {
          this.initializeRecommendations();
      }
  }

  combineVariants(cartItems) {
      const combinedItems = {};
      cartItems.forEach(item => {
          const productId = item.product_id;
          if (combinedItems[productId]) {
              combinedItems[productId].quantity += item.quantity;
          } else {
              combinedItems[productId] = { ...item };
          }
      });
      return Object.values(combinedItems);
  }

  initializeRecommendations() {
      this.loadRecommendations();
  }

  loadRecommendations() {
      const productIds = this.combinedCartItems.map(item => item.product_id);
      const recommendationPromises = productIds.map(id => this.fetchRecommendationsForProduct(id));
      
      Promise.all(recommendationPromises)
          .then(allRecommendations => {
              const processedRecommendations = this.processRecommendations(allRecommendations, productIds);
              this.renderRecommendations(processedRecommendations);
          })
          .catch(error => {
              console.error('Error loading recommendations:', error);
          });
  }

  async fetchRecommendationsForProduct(productId) {
      const url = `${this.dataset.url}&product_id=${productId}&section_id=${this.dataset.sectionId}`;
      try {
          const response = await fetch(url);
          const text = await response.text();
          const html = document.createElement('div');
          html.innerHTML = text;          
          const productCards = html.querySelectorAll('.cart-drawer__recommendations .grid__item');
          return Array.from(productCards).map(card => this.extractProductData(card));
      } catch (error) {
          console.error(`Error fetching recommendations for product ${productId}:`, error);
          return [];
      }
  }

  extractProductData(card) {
      const productInfoElement = card.querySelector('product-info-cart-upsell');
      if (productInfoElement) {
          const productId = productInfoElement.dataset.productId;
          return {
              id: productId,
              element: card.cloneNode(true)
          };
      }
      return null;
  }

  processRecommendations(allRecommendations, sourceProductIds) {
      const maxPosition = this.maxPosition;
      const processedRecommendations = [];
      allRecommendations.forEach((recommendations, index) => {
          const sourceProductId = sourceProductIds[index];
          const sourceCartItem = this.combinedCartItems.find(item => item.product_id === sourceProductId);
          const sourceQuantity = sourceCartItem ? sourceCartItem.quantity : 1;

          recommendations.forEach((rec, position) => {
              if (!rec) return;
              const existingRec = processedRecommendations.find(r => r.id === rec.id);
              const invertedPosition = maxPosition + 1 - (position + 1);

              if (existingRec) {
                  existingRec.count++;
                  existingRec.recommendedBy.push({
                      productId: sourceProductId,
                      position: position + 1,
                      quantity: sourceQuantity,
                      invertedPosition: invertedPosition
                  });
              } else {
                  processedRecommendations.push({
                      ...rec,
                      count: 1,
                      recommendedBy: [{
                          productId: sourceProductId,
                          position: position + 1,
                          quantity: sourceQuantity,
                          invertedPosition: invertedPosition
                      }],
                      originalPosition: null
                  });
              }
          });
      });

      processedRecommendations.forEach((rec, index) => {
          rec.originalPosition = index + 1;
      });

      processedRecommendations.sort((a, b) => b.score - a.score);

      return processedRecommendations;
  }

  renderRecommendations(recommendations) {     
    const productsToShow = parseInt(this.dataset.productsToShow, 10) || recommendations.length; const limitedRecommendations = recommendations.slice(0, productsToShow); 
    const wrapper = document.createElement('div');
    wrapper.className = 'swiper cart-reco-swiper';
    
    const swiperWrapper = document.createElement('div');
    swiperWrapper.className = 'swiper-wrapper';

    const swiperPagination = document.createElement('div');
    swiperPagination.className = 'swiper-pagination';
    
    limitedRecommendations.forEach((item) => { if (item && item.element) { swiperWrapper.appendChild(item.element); } }); 
    wrapper.appendChild(swiperWrapper); 
    wrapper.appendChild(swiperPagination); 
    
    this.innerHTML = ''; this.appendChild(wrapper); 
    const recommendationsContainer = this.closest('.cart-drawer__recommendations'); 
    if (recommendationsContainer) { 
      if (limitedRecommendations.length > 0) { 
        recommendationsContainer.classList.add('has-recommendations'); 
      } else {
         recommendationsContainer.classList.remove('has-recommendations'); 
      } 
    } 
    if (limitedRecommendations.length > 0) {
       this.classList.add('product-recommendations--loaded'); 
    } else {
      this.classList.remove('product-recommendations--loaded'); 
    } setTimeout(() => { 
      this.initSwiper();
      this.dispatchEvent(new CustomEvent('cart-recommendations-rendered', { bubbles: true })); 
    }, 0); 
  }

  initSwiper() {
    if (!window.Swiper) {
      console.warn("Swiper not loaded.");
      return;
    }

    new Swiper('.cart-reco-swiper', {
      slidesPerView: 1.1,
      spaceBetween: 10,
      pagination: {
        el: '.swiper-pagination',
        clickable: true,
      },
      navigation: {
        nextEl: '.swiper-button-next',
        prevEl: '.swiper-button-prev'
      }
    });
  }
}

customElements.define('comprehensive-cart-recommendations', ComprehensiveCartRecommendations);

class ProductInfoCartUpsell {
  static instance = null;

  constructor() {
    if (ProductInfoCartUpsell.instance) {
      return ProductInfoCartUpsell.instance;
    }
    ProductInfoCartUpsell.instance = this;

    this.handleRecommendationsRendered = this.handleRecommendationsRendered.bind(this);
    this.eventHandlers = new Map();
    this.initialize();
  }

  initialize() {
    this.container = document.querySelector('.cart-drawer__recommendations');
    if (!this.container) {
      return;
    }
    this.initProductElements();
    this.addEventListeners();
  }

  removeEventListeners() {
    if (this.productElements) {
      this.productElements.forEach((productElement) => {
        this.removeEventListenersFromElement(productElement);
      });
    }

    document.removeEventListener('cart-recommendations-rendered', this.handleRecommendationsRendered);
  }

  removeEventListenersFromElement(element) {
    const variantSelects = element.querySelector('variant-selects-cart-upsell');
    if (variantSelects) {
      const handler = this.eventHandlers.get(variantSelects);
      if (handler) {
        variantSelects.removeEventListener('cart-upsell-variant-change', handler);
        this.eventHandlers.delete(variantSelects);
      }
    }
    const productForm = element.querySelector('product-form');
    if (productForm) {
      const handler = this.eventHandlers.get(productForm);
      if (handler) {
        productForm.removeEventListener('submit', handler);
        this.eventHandlers.delete(productForm);
      }
    }
  }

  initProductElements() {
    this.removeEventListeners();
    this.productElements = this.container.querySelectorAll('.cart-upsell-item');
    this.productElements.forEach((productElement) => {
      this.initializeProductHandlers(productElement);
    });
  }

  addEventListeners() {
    document.addEventListener('cart-recommendations-rendered', this.handleRecommendationsRendered);
  }

  handleRecommendationsRendered() {
    this.initialize();
  }

  initializeProductHandlers(productElement) {
    const variantSelects = productElement.querySelector('variant-selects-cart-upsell');
    if (variantSelects) {
      const variantChangeHandler = this.handleVariantChange.bind(this, productElement);
      this.eventHandlers.set(variantSelects, variantChangeHandler);
      variantSelects.addEventListener('cart-upsell-variant-change', variantChangeHandler);
    }

    const productForm = productElement.querySelector('product-form');
    if (productForm) {
      const addToCartHandler = this.handleAddToCart.bind(this, productElement);
      this.eventHandlers.set(productForm, addToCartHandler);
      productForm.addEventListener('submit', addToCartHandler);
    }
  }

  handleVariantChange(productElement, event) {
    const variantSelects = event.target.closest('variant-selects-cart-upsell');

    if (variantSelects) {
      const selectedOptions = event.detail.selectedOptionValues;
      const variantData = this.getVariantIdByOptions(productElement, selectedOptions);

      if (variantData) {
        const productHandle = productElement.dataset.productHandle;
        this.renderProductInfo(productElement, productHandle, variantData.id);
      }
    }
  }

  getSelectedOptions(variantSelects) {
      const optionElements = variantSelects.querySelectorAll('[name^="options["]');
      const selectedOptions = [];
    
      optionElements.forEach((element) => {
        if (element.tagName === 'SELECT') {
          selectedOptions.push(element.value);
        } else if (element.tagName === 'INPUT' && element.type === 'radio' && element.checked) {
          selectedOptions.push(element.value);
        }
      });
    
      return selectedOptions;
    }
    
  getVariantIdByOptions(productElement, selectedOptions) {
      const selector = '#ProductJSON-' + productElement.dataset.productId;
      const variantJson = productElement.querySelector(selector);
    
      if (!variantJson) {
        return null;
      }
    
      const productData = JSON.parse(variantJson.textContent);
      const variant = productData.variants.find((v) =>
        selectedOptions.every((option, index) => v.options[index] === option)
      );
    
      return variant ? { id: variant.id, variant: variant } : null;
    }
    
  renderProductInfo(productElement, productHandle, variantId) {
    const url = this.buildProductUrl(productHandle, variantId);

    fetch(url)
      .then((response) => response.text())
      .then((responseText) => {
        const html = new DOMParser().parseFromString(responseText, 'text/html');
        const newProductInfo = html.querySelector('product-info-cart-upsell');
        if (newProductInfo) {
          this.updateUpsellProductInfo(productElement, newProductInfo);
        }
      })
      .catch((error) => {
        console.error('Error updating product info:', error);
      });
  }

  buildProductUrl(productHandle, variantId) {
    const params = new URLSearchParams({
      variant: variantId,
      section_id: 'cart-drawer-upsell-product'
    });

    return `/products/${productHandle}?${params.toString()}`;
  }

  updateUpsellProductInfo(oldProductElement, newProductElement) {
    const productId = oldProductElement.dataset.productId;
    const sectionId = oldProductElement.dataset.section;

    this.removeEventListenersFromElement(oldProductElement);

    oldProductElement.innerHTML = newProductElement.innerHTML;

    oldProductElement.dataset.productId = productId;
    oldProductElement.dataset.section = sectionId;

    this.initializeProductHandlers(oldProductElement);
  }

  handleAddToCart(productElement, event) {
    document.addEventListener('cart:update', (event) => {
    }, { once: true });
  }
}

new ProductInfoCartUpsell();

