document.addEventListener("DOMContentLoaded", () => {

    /* ==========================================
       HEADER SCROLL
    ========================================== */

    const header = document.getElementById("header");

    function handleHeader() {
        if (window.scrollY > 20) {
            header.classList.add("scrolled");
        } else {
            header.classList.remove("scrolled");
        }
    }

    window.addEventListener("scroll", handleHeader);

    handleHeader();


    /* ==========================================
       MOBILE MENU
    ========================================== */

    const menuBtn = document.getElementById("menuBtn");
    const nav = document.getElementById("nav");

    menuBtn.addEventListener("click", () => {

        nav.classList.toggle("open");

        const icon = menuBtn.querySelector("i");

        if (nav.classList.contains("open")) {

            icon.classList.remove("fa-bars");
            icon.classList.add("fa-xmark");

        } else {

            icon.classList.remove("fa-xmark");
            icon.classList.add("fa-bars");

        }

    });


    /* ==========================================
       CLOSE MOBILE MENU
    ========================================== */

    const navLinks = document.querySelectorAll(".nav a");

    navLinks.forEach(link => {

        link.addEventListener("click", () => {

            nav.classList.remove("open");

            const icon = menuBtn.querySelector("i");

            icon.classList.remove("fa-xmark");
            icon.classList.add("fa-bars");

        });

    });


    /* ==========================================
       SCROLL REVEAL
    ========================================== */

    const revealElements = document.querySelectorAll(".reveal");

    const revealObserver = new IntersectionObserver(

        entries => {

            entries.forEach(entry => {

                if (entry.isIntersecting) {

                    entry.target.classList.add("active");

                    revealObserver.unobserve(entry.target);

                }

            });

        },

        {
            threshold: 0.12
        }

    );

    revealElements.forEach(element => {
        revealObserver.observe(element);
    });


    /* ==========================================
       ACTIVE NAVIGATION
    ========================================== */

    const sections = document.querySelectorAll("section[id]");

    function updateNavigation() {

        let currentSection = "";

        sections.forEach(section => {

            const sectionTop = section.offsetTop - 150;

            if (window.scrollY >= sectionTop) {
                currentSection = section.getAttribute("id");
            }

        });

        navLinks.forEach(link => {

            link.classList.remove("active");

            if (
                link.getAttribute("href") ===
                `#${currentSection}`
            ) {

                link.classList.add("active");

            }

        });

    }

    window.addEventListener("scroll", updateNavigation);


    /* ==========================================
       COUNTER ANIMATION
    ========================================== */

    const stats = document.querySelectorAll(
        ".hero-stats strong"
    );

    stats.forEach(stat => {

        const text = stat.textContent;

        if (!text.includes("+")) {
            return;
        }

        const finalNumber =
            parseInt(text.replace(/\D/g, ""));

        let current = 0;

        const increment =
            Math.max(1, Math.floor(finalNumber / 50));

        const timer = setInterval(() => {

            current += increment;

            if (current >= finalNumber) {

                current = finalNumber;
                clearInterval(timer);

            }

            stat.textContent = `${current}+`;

        }, 25);

    });


    /* ==========================================
       FAKE BIN STATUS UPDATE
       Dùng để landing page nhìn "real-time" hơn
    ========================================== */

    const statusNumbers =
        document.querySelectorAll(
            ".dashboard-footer strong"
        );

    function simulateStatus() {

        if (statusNumbers.length < 3) {
            return;
        }

        let normal =
            210 + Math.floor(Math.random() * 15);

        let warning =
            55 + Math.floor(Math.random() * 15);

        let critical =
            12 + Math.floor(Math.random() * 10);

        statusNumbers[0].textContent = normal;
        statusNumbers[1].textContent = warning;
        statusNumbers[2].textContent = critical;

    }

    setInterval(simulateStatus, 5000);


    /* ==========================================
       DASHBOARD MOUSE EFFECT
    ========================================== */

    const dashboard =
        document.querySelector(".dashboard-card");

    const heroVisual =
        document.querySelector(".hero-visual");

    if (
        dashboard &&
        heroVisual &&
        window.innerWidth > 1000
    ) {

        heroVisual.addEventListener(
            "mousemove",
            event => {

                const rect =
                    heroVisual.getBoundingClientRect();

                const x =
                    event.clientX - rect.left;

                const y =
                    event.clientY - rect.top;

                const centerX =
                    rect.width / 2;

                const centerY =
                    rect.height / 2;

                const rotateY =
                    ((x - centerX) / centerX) * 4;

                const rotateX =
                    -((y - centerY) / centerY) * 3;

                dashboard.style.transform =
                    `
                    perspective(1000px)
                    rotateX(${rotateX}deg)
                    rotateY(${rotateY}deg)
                    `;

            }
        );


        heroVisual.addEventListener(
            "mouseleave",
            () => {

                dashboard.style.transform =
                    `
                    perspective(1000px)
                    rotateY(-4deg)
                    rotateX(2deg)
                    `;

            }
        );

    }


    /* ==========================================
       RANDOM MAP MARKER PULSE
    ========================================== */

    const markers =
        document.querySelectorAll(".bin-marker");

    function pulseRandomMarker() {

        markers.forEach(marker => {
            marker.style.scale = "1";
        });

        if (!markers.length) {
            return;
        }

        const randomIndex =
            Math.floor(
                Math.random() * markers.length
            );

        const marker =
            markers[randomIndex];

        marker.style.transition =
            "transform .3s, scale .3s";

        marker.style.scale = "1.25";

        setTimeout(() => {
            marker.style.scale = "1";
        }, 700);

    }

    setInterval(
        pulseRandomMarker,
        2200
    );

});