document.addEventListener('DOMContentLoaded', function() {

    //======================================================================
    // Mobile Navigation Menu Toggle
    //======================================================================
    const navbarToggle = document.getElementById('navbar-toggle');
    const navbarLinks = document.getElementById('navbar-links');

    if (navbarToggle && navbarLinks) {
        navbarToggle.addEventListener('click', function() {
            navbarLinks.classList.toggle('hidden');
            navbarLinks.classList.toggle('flex');
        });
    }

    //======================================================================
    // Smooth Scrolling & Active Link Highlighting
    //======================================================================
    const navLinks = document.querySelectorAll('a.menu');
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';

    navLinks.forEach(anchor => {
        const linkPage = anchor.getAttribute('href').split('/').pop();

        // Highlight the active page link
        if (linkPage === currentPage) {
            document.querySelector('.menu.active-page')?.classList.remove('active-page');
            anchor.classList.add('active-page');
        }

        // Add smooth scrolling to internal links (like #contact)
        if (anchor.getAttribute('href').startsWith('#')) {
            anchor.addEventListener('click', function(e) {
                e.preventDefault();
                const targetElement = document.querySelector(this.getAttribute('href'));
                if (targetElement) {
                    targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
                // Close mobile menu after clicking a link
                if (window.innerWidth < 768) {
                    navbarLinks.classList.add('hidden');
                    navbarLinks.classList.remove('flex');
                }
            });
        }
    });

    //======================================================================
    // Google Map Initialization (defined globally for API callback)
    //======================================================================
    window.initMap = function() {
        const mapElement = document.getElementById('map');
        if (!mapElement) return;

        try {
            const puneLocation = { lat: 18.5634, lng: 73.9197 };
            const map = new google.maps.Map(mapElement, {
                zoom: 15,
                center: puneLocation,
                disableDefaultUI: true,
                styles: [
                    {"featureType":"all","elementType":"labels.text.fill","stylers":[{"saturation":36},{"color":"#333333"},{"lightness":40}]},{"featureType":"all","elementType":"labels.text.stroke","stylers":[{"visibility":"on"},{"color":"#ffffff"},{"lightness":16}]},{"featureType":"all","elementType":"labels.icon","stylers":[{"visibility":"off"}]},{"featureType":"administrative","elementType":"geometry.fill","stylers":[{"color":"#fefefe"},{"lightness":20}]},{"featureType":"administrative","elementType":"geometry.stroke","stylers":[{"color":"#fefefe"},{"lightness":17},{"weight":1.2}]},{"featureType":"landscape","elementType":"geometry","stylers":[{"color":"#f5f5f5"},{"lightness":20}]},{"featureType":"poi","elementType":"geometry","stylers":[{"color":"#f5f5f5"},{"lightness":21}]},{"featureType":"road.highway","elementType":"geometry.fill","stylers":[{"color":"#ffffff"},{"lightness":17}]},{"featureType":"road.highway","elementType":"geometry.stroke","stylers":[{"color":"#ffffff"},{"lightness":29},{"weight":0.2}]},{"featureType":"road.arterial","elementType":"geometry","stylers":[{"color":"#ffffff"},{"lightness":18}]},{"featureType":"road.local","elementType":"geometry","stylers":[{"color":"#ffffff"},{"lightness":16}]},{"featureType":"transit","elementType":"geometry","stylers":[{"color":"#f2f2f2"},{"lightness":19}]},{"featureType":"water","elementType":"geometry","stylers":[{"color":"#e9e9e9"},{"lightness":17}]}
                ]
            });
            new google.maps.Marker({ position: puneLocation, map: map, title: 'SSAP Tech Solutions LLP' });
        } catch (error) {
            console.error("Error initializing Google Map:", error);
            mapElement.innerHTML = '<p class="text-center text-red-500 p-4">Could not load the map.</p>';
        }
    };
});

window.onload = function() {
    //======================================================================
    // Dynamically Load Google Maps API Script
    //======================================================================
    const loadGoogleMapsScript = () => {
        const mapElement = document.getElementById('map');
        if (!mapElement) return;

        // IMPORTANT: Replace with your actual Google Maps API Key
        const apiKey = "YOUR_GOOGLE_MAPS_API_KEY"; 

        if (apiKey === "YOUR_GOOGLE_MAPS_API_KEY") {
            console.warn("Google Maps API Key is missing.");
            mapElement.innerHTML = '<div class="flex items-center justify-center h-full bg-gray-200"><p class="text-gray-600 p-4 text-center">Map functionality requires an API key.</p></div>';
            return;
        }

        if (!document.querySelector('script[src*="maps.googleapis.com"]')) {
            const script = document.createElement('script');
            script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initMap`;
            script.async = true;
            script.defer = true;
            document.head.appendChild(script);
            script.onerror = () => {
                console.error("Failed to load Google Maps script.");
                mapElement.innerHTML = '<div class="flex items-center justify-center h-full bg-gray-200"><p class="text-red-500 p-4 text-center">Failed to load map data.</p></div>';
            };
        }
    };
    
    loadGoogleMapsScript();

    //======================================================================
    // Initialize AI Chatbot
    //======================================================================
    if (typeof window.aiChatbot !== 'undefined' && typeof window.aiChatbot.init === 'function') {
        window.aiChatbot.init();
    }
};