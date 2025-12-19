"use client";

import { useEffect, useRef } from 'react';

export default function ClickSoundProvider() {
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        // Initialize audio object once
        audioRef.current = new Audio('/sounds/click.mp3');
        audioRef.current.volume = 0.5; // Adjust volume as needed
    }, []);

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            // Only play sound on mobile/tablet (screens smaller than 1024px)
            if (window.innerWidth >= 1024) return;

            // Logic to determine if the clicked element is "interactive"
            const target = e.target as HTMLElement;

            // Traverse up to find a clickable ancestor if the target itself isn't obvious
            const clickable = target.closest('button, a, input[type="button"], input[type="submit"], input[type="checkbox"], input[type="radio"], select, [role="button"], [role="link"], [role="menuitem"], .cursor-pointer');

            if (clickable) {
                if (audioRef.current) {
                    // Clone node to allow overlapping sounds if clicked rapidly
                    const sound = audioRef.current.cloneNode() as HTMLAudioElement;
                    sound.volume = 0.5;
                    sound.play().catch(err => {
                        // Ignore auto-play errors (usually happen if user hasn't interacted yet, but this is a click handler so it should be fine)
                        console.warn("Audio play failed", err);
                    });
                }
            }
        };

        window.addEventListener('click', handleClick, true); // Capture phase to ensure we catch it before stopPropagation might stop it (though typically click sounds should coincide with action)

        return () => {
            window.removeEventListener('click', handleClick, true);
        };
    }, []);

    return null; // Logic only, no UI
}
