// chatbot.js

const aiChatbot = {
    // --- Configuration & State ---
    config: {
        fuzzyMatchThreshold: 2, // How close a typo can be to a keyword
        botTypingDelay: 800,   // Milliseconds to show the "typing" indicator
    },
    elements: {},
    initialized: false,

    // --- Knowledge Base ---
    keywordResponses: {
    "service": "We provide software design, development, maintenance, website designing, mobile app development, network security, enterprise solutions, and consulting.",
    "contact": "You can reach us via the contact form on our website or email us at contact@ssaptechsolutions.com.",
    "location": "SSAP Tech Solutions LLP is located in India.",
    "iso": "Yes! We specialize in ISO 27001 audits and compliance services.",
    "audit": "Yes! We specialize in ISO 27001 audits and compliance services.",
    "industry": "We serve IT, finance, healthcare, retail, and many other industries.",
    "job": "Visit our Careers page and submit your application online.",
    "career": "Explore exciting career opportunities at SSAP Tech Solutions on our Careers page and apply online.",
    "internship": "Yes, we offer internship opportunities for fresh graduates and students.",
    "vision": "Our vision is to drive innovation and digital transformation for businesses worldwide.",
    "technology": "We work with AI, cloud, full-stack development, cybersecurity, and enterprise tools.",
    "mobile": "Yes, we design and develop mobile applications for iOS and Android.",
    "web": "Yes, we offer full-stack website design and development.",
    "cloud": "Yes, we help businesses with cloud migration and management.",
    "mission": "Our mission is to deliver reliable, secure, and innovative IT solutions.",
    "support": "Yes, we provide 24/7 technical support to our clients.",
    "full form": "SSAP stands for Smart Solutions for Advanced Professionals.",
    "demo": "Yes, you can schedule a free consultation or demo via our website.",
    "ai": "Absolutely! We develop AI-driven business solutions.",
    "startup": "Yes, we love helping startups grow with scalable IT solutions.",
    "enterprise": "Yes, we provide ERP, CRM, and enterprise software development.",
    "certified": "Yes, we are ISO 27001 certified.",
    "estimate": "Yes, contact us with your requirements, and we’ll provide a free estimate.",
    "security": "Yes, data security and compliance are core to our services.",
    "language": "We use Python, Java, C#, JavaScript, PHP, and more.",
    "ui": "Yes, our team designs modern and user-friendly UI/UX.",
    "blockchain": "Yes, we work with blockchain and fintech solutions.",
    "training": "Yes, we conduct corporate training in various technologies.",
    "since": "We have been delivering IT solutions since 2021.",
    "partner": "Yes, we are open to collaborations and partnerships.",
    "consultation": "Yes, we offer a free first consultation.",
    "ecommerce": "Yes, we specialize in secure e-commerce solutions.",
    "devops": "Yes, we provide DevOps automation and CI/CD pipelines.",
    "networking": "Yes, we offer secure networking and infrastructure management.",
    "global": "Yes, we serve clients across the globe.",
    "quote": "Simply contact us with your requirements for a free quote.",
    "ml": "Yes, we design ML models for predictive analytics and automation.",
    "seo": "Yes, we provide SEO and digital marketing solutions.",
    "government": "Yes, we work with government and private organizations.",
    "hours": "We are available 24/7 for client support.",
    "crm": "Yes, we design and implement CRM solutions.",
    "outsource": "Yes, we provide outsourcing and dedicated team models.",
    "maintenance": "Yes, we offer AMC and project maintenance services.",
    "custom": "Yes, we build fully customized software solutions.",
    "cybersecurity": "Yes, we offer penetration testing, audits, and security solutions.",
    "api": "Yes, we integrate third-party APIs and services.",
    "transformation": "Yes, we guide businesses through end-to-end digital transformation.",
    "erp": "Yes, we build ERP solutions for enterprises.",
    "consulting": "Yes, we provide IT and management consulting.",
    "follow": "You can follow us on LinkedIn, Twitter, and Facebook.",
    "different": "Our focus on innovation, trust, and security makes us stand out.",
    "thanks": "You're welcome!",
    },

    // --- Initialization ---
    init() {
        if (this.initialized) return;
        this.elements = {
            chatToggle: document.getElementById("chat-toggle"),
            chatContainer: document.getElementById("chatbot-container"),
            closeChat: document.getElementById("close-chat"),
            sendBtn: document.getElementById("send-btn"),
            chatInput: document.getElementById("chat-input"),
            chatMessages: document.getElementById("chat-messages"),
        };
        if (Object.values(this.elements).some(el => !el)) {
            console.error("Chatbot initialization failed: Missing required elements.");
            return;
        }
        this.addEventListeners();
        this.initialized = true;
    },

    // --- Event Handling ---
    addEventListeners() {
        this.elements.chatToggle.addEventListener("click", () => this.toggleChatWindow(true));
        this.elements.closeChat.addEventListener("click", () => this.toggleChatWindow(false));
        this.elements.sendBtn.addEventListener("click", () => this.handleUserMessage());
        this.elements.chatInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") this.handleUserMessage();
        });
    },

    // --- UI Functions ---
    toggleChatWindow(isOpen) {
        if (isOpen) {
            this.elements.chatContainer.classList.remove("hidden");
            this.elements.chatInput.focus();
            if (this.elements.chatMessages.children.length === 0) {
                this.addMessage("bot", "Hello! I'm the SSAP AI Assistant. Ask me about our services, careers, or anything else!");
            }
        } else {
            this.elements.chatContainer.classList.add("hidden");
        }
    },

    addMessage(sender, text) {
        const msgWrapper = document.createElement("div");
        msgWrapper.className = `flex ${sender === "user" ? "justify-end" : "justify-start"} mb-2`;
        const msgBubble = document.createElement("div");
        msgBubble.className = `inline-block px-4 py-2 rounded-lg max-w-xs ${sender === "user" ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-800"}`;
        msgBubble.innerHTML = text;
        msgWrapper.appendChild(msgBubble);
        this.elements.chatMessages.appendChild(msgWrapper);
        this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
    },

    showTypingIndicator() {
        const indicator = document.createElement("div");
        indicator.id = "typing-indicator";
        indicator.className = "flex justify-start mb-2";
        indicator.innerHTML = `<div class="inline-block px-4 py-2 rounded-lg bg-gray-200 text-gray-500"><span class="typing-dot">.</span><span class="typing-dot">.</span><span class="typing-dot">.</span></div>`;
        this.elements.chatMessages.appendChild(indicator);
        this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
    },

    hideTypingIndicator() {
        document.getElementById("typing-indicator")?.remove();
    },

    // --- Core Chatbot Logic ---
    handleUserMessage() {
        const userInput = this.elements.chatInput.value.trim();
        if (!userInput) return;
        this.addMessage("user", userInput);
        this.elements.chatInput.value = "";
        this.showTypingIndicator();
        setTimeout(() => {
            this.hideTypingIndicator();
            const botResponse = this.getBotResponse(userInput);
            this.addMessage("bot", botResponse);
        }, this.config.botTypingDelay);
    },

    getBotResponse(userInput) {
        const lowerCaseInput = userInput.toLowerCase();
        const foundResponses = new Set();
        for (const word of lowerCaseInput.split(/\s+/)) {
            const normWord = word.endsWith("s") ? word.slice(0, -1) : word;
            for (const keyword in this.keywordResponses) {
                const normKey = keyword.endsWith("s") ? keyword.slice(0, -1) : keyword;
                if (normWord === normKey || (this.levenshtein(normWord, normKey) <= this.config.fuzzyMatchThreshold)) {
                    foundResponses.add(this.keywordResponses[keyword]);
                }
            }
        }
        if (foundResponses.size > 0) return Array.from(foundResponses).join("<br><br>");
        return "I'm not sure how to answer that. Could you please try rephrasing? You can ask me about our 'services', 'location', or 'careers'.";
    },

    // --- Utility: Levenshtein Distance for Fuzzy Matching ---
    levenshtein(a, b) {
        const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
        for (let i = 0; i <= a.length; i += 1) matrix[0][i] = i;
        for (let j = 0; j <= b.length; j += 1) matrix[j][0] = j;
        for (let j = 1; j <= b.length; j += 1) {
            for (let i = 1; i <= a.length; i += 1) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                matrix[j][i] = Math.min(matrix[j][i - 1] + 1, matrix[j - 1][i] + 1, matrix[j - 1][i - 1] + cost);
            }
        }
        return matrix[b.length][a.length];
    },
};

document.addEventListener("DOMContentLoaded", () => {
    const style = document.createElement('style');
    style.innerHTML = `
        .typing-dot { animation: typing-blink 1.4s infinite both; display: inline-block; }
        .typing-dot:nth-child(2) { animation-delay: 0.2s; }
        .typing-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes typing-blink { 0% { opacity: 0.2; } 20% { opacity: 1; } 100% { opacity: 0.2; } }
    `;
    document.head.appendChild(style);
    window.aiChatbot = aiChatbot;
    window.aiChatbot.init();
});