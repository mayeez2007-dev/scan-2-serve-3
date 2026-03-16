// ===================================
// Reviews / Feedback System (Cart Page)
// - Stores reviews in localStorage
// - Interactive star rating (1-5) with color mapping
// - Average rating summary + animated review cards
// ===================================

(function () {
  const STORAGE_KEY = 'restaurantReviews';

  function $(selector) {
    return document.querySelector(selector);
  }

  function getReviews() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveReviews(reviews) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reviews));
  }

  function formatDate(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  }

  function starsHtml(rating) {
    const r = Math.max(1, Math.min(5, Number(rating) || 0));
    return `
      <span class="review-stars" aria-label="${r} out of 5 stars" data-rating="${r}">
        ${Array.from({ length: 5 }).map((_, i) => {
          const filled = i < r ? 'filled' : '';
          return `<span class="review-star ${filled}" aria-hidden="true">★</span>`;
        }).join('')}
      </span>
    `;
  }

  function computeAverage(reviews) {
    if (!reviews.length) return { avg: 0, count: 0 };
    const sum = reviews.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
    return { avg: sum / reviews.length, count: reviews.length };
  }

  function renderSummary(reviews) {
    const summaryEl = $('#reviews-summary');
    if (!summaryEl) return;

    const { avg, count } = computeAverage(reviews);
    const avgFixed = avg ? avg.toFixed(1) : '0.0';
    const rounded = Math.round(avg);

    summaryEl.innerHTML = `
      <div class="reviews-summary-left">
        <div class="reviews-average">${avgFixed}<span class="reviews-average-max">/5</span></div>
        <div class="reviews-average-stars" data-rating="${Math.min(5, Math.max(1, rounded || 1))}">
          ${Array.from({ length: 5 }).map((_, i) => {
            const filled = i < rounded ? 'filled' : '';
            return `<span class="review-star ${filled}" aria-hidden="true">★</span>`;
          }).join('')}
        </div>
        <div class="reviews-count">Based on ${count} review${count === 1 ? '' : 's'}</div>
      </div>
      <div class="reviews-summary-right">
        <div class="reviews-tip">Tip: Share what you loved most—service, taste, ambiance, or delivery.</div>
      </div>
    `;
  }

  function renderReviewsList(reviews) {
    const listEl = $('#reviews-list');
    if (!listEl) return;

    if (!reviews.length) {
      listEl.innerHTML = `
        <div class="reviews-empty scroll-reveal">
          <div class="reviews-empty-icon">✍️</div>
          <h4>No reviews yet</h4>
          <p>Be the first to share your experience.</p>
        </div>
      `;
      return;
    }

    // newest first
    const ordered = [...reviews].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    listEl.innerHTML = ordered.map((r) => {
      const safeName = (r.name || 'Guest').toString().slice(0, 60);
      const safeMsg = (r.message || '').toString().slice(0, 800);
      const date = r.createdAt ? formatDate(r.createdAt) : '';

      return `
        <article class="review-card scroll-reveal">
          <header class="review-card-header">
            <div class="review-card-meta">
              <div class="reviewer-name">${escapeHtml(safeName)}</div>
              <div class="review-date">${escapeHtml(date)}</div>
            </div>
            ${starsHtml(r.rating)}
          </header>
          <div class="review-message">${escapeHtml(safeMsg)}</div>
        </article>
      `;
    }).join('');
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  // ===================================
  // Interactive Star Rating
  // ===================================
  function initStarRating() {
    const container = $('#star-rating');
    const hidden = $('#rating-value');
    const hint = $('#rating-hint');

    if (!container || !hidden) return;

    const stars = Array.from(container.querySelectorAll('.star'));

    let current = 0;

    function paint(value) {
      const v = Number(value) || 0;
      container.dataset.rating = v ? String(v) : '0';

      stars.forEach((s) => {
        const sv = Number(s.dataset.value);
        s.classList.toggle('filled', sv <= v);
        s.setAttribute('aria-checked', sv === v ? 'true' : 'false');
      });

      if (hint) {
        hint.textContent = v ? `Selected: ${v} star${v === 1 ? '' : 's'}` : 'Select a rating';
      }
    }

    function setRating(value) {
      current = Math.max(1, Math.min(5, Number(value) || 0));
      hidden.value = String(current);
      container.classList.remove('rating-bounce');
      // restart animation
      void container.offsetWidth;
      container.classList.add('rating-bounce');
      paint(current);
    }

    // hover preview
    stars.forEach((star) => {
      star.addEventListener('mouseenter', () => {
        const v = Number(star.dataset.value);
        paint(v);
      });

      star.addEventListener('mouseleave', () => {
        paint(current);
      });

      star.addEventListener('click', () => {
        setRating(star.dataset.value);
      });

      // keyboard
      star.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setRating(star.dataset.value);
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
          e.preventDefault();
          setRating(Math.max(1, current - 1));
          stars[Math.max(0, current - 1 - 1)]?.focus();
        }
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
          e.preventDefault();
          setRating(Math.min(5, current + 1));
          stars[Math.min(4, current + 1 - 1)]?.focus();
        }
      });
    });

    // init
    paint(0);
  }

  // ===================================
  // Form Handling
  // ===================================
  function initReviewForm() {
    const form = $('#review-form');
    if (!form) return;

    const nameEl = $('#review-name');
    const emailEl = $('#review-email');
    const messageEl = $('#review-message');
    const ratingEl = $('#rating-value');
    const submitBtn = $('#submit-review-btn');

    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const name = (nameEl?.value || '').trim();
      const email = (emailEl?.value || '').trim();
      const message = (messageEl?.value || '').trim();
      const rating = Number(ratingEl?.value || 0);

      clearFormErrors(form);

      let valid = true;

      if (!name) {
        setFieldError('#review-name', 'Please enter your name.');
        valid = false;
      }

      if (!rating || rating < 1 || rating > 5) {
        setFieldError('#star-rating', 'Please select a rating.');
        valid = false;
      }

      if (!message || message.length < 10) {
        setFieldError('#review-message', 'Please write at least 10 characters.');
        valid = false;
      }

      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setFieldError('#review-email', 'Please enter a valid email address.');
        valid = false;
      }

      if (!valid) {
        // friendly nudge
        if (typeof showToast === 'function') {
          showToast('Please check the review form and try again.');
        }
        return;
      }

      // Submit animation
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.classList.add('is-loading');
        submitBtn.dataset.originalText = submitBtn.textContent || 'Submit Review';
        submitBtn.innerHTML = `<span class="loading" aria-hidden="true"></span><span class="btn-text">Submitting…</span>`;
      }

      window.setTimeout(() => {
        const reviews = getReviews();
        reviews.push({
          id: `${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          name,
          email,
          message,
          rating,
          createdAt: new Date().toISOString()
        });

        saveReviews(reviews);
        renderSummary(reviews);
        renderReviewsList(reviews);

        // reset form
        form.reset();
        const starContainer = $('#star-rating');
        if (starContainer) {
          starContainer.dataset.rating = '0';
          starContainer.querySelectorAll('.star').forEach(s => s.classList.remove('filled'));
        }
        const ratingHidden = $('#rating-value');
        if (ratingHidden) ratingHidden.value = '';
        const hint = $('#rating-hint');
        if (hint) hint.textContent = 'Select a rating';

        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.classList.remove('is-loading');
          submitBtn.textContent = submitBtn.dataset.originalText || 'Submit Review';
        }

        // success toast + subtle focus
        if (typeof showToast === 'function') {
          showToast('Thank you! Your review has been submitted.');
        }

        $('#reviews-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 650);
    });

    function clearFormErrors(root) {
      root.querySelectorAll('.field-error').forEach(el => el.remove());
      root.querySelectorAll('.has-error').forEach(el => el.classList.remove('has-error'));
    }

    function setFieldError(selector, message) {
      const el = $(selector);
      if (!el) return;

      el.classList.add('has-error');

      const err = document.createElement('div');
      err.className = 'field-error';
      err.textContent = message;

      // for star rating, place error below container
      if (selector === '#star-rating') {
        el.parentElement?.appendChild(err);
      } else {
        el.parentElement?.appendChild(err);
      }
    }
  }

  // ===================================
  // Boot
  // ===================================
  document.addEventListener('DOMContentLoaded', () => {
    const reviewsSectionExists = !!document.getElementById('reviews');
    if (!reviewsSectionExists) return;

    initStarRating();
    initReviewForm();

    const reviews = getReviews();
    renderSummary(reviews);
    renderReviewsList(reviews);
  });
})();
