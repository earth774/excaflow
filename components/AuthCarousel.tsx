"use client";

import { useState, useEffect } from "react";

export interface Slide {
  image: string;
  title: string;
  description: string;
}

interface AuthCarouselProps {
  slides: Slide[];
  interval?: number;
}

export default function AuthCarousel({ slides, interval = 5000 }: AuthCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (slides.length <= 1) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % slides.length);
    }, interval);

    return () => clearInterval(timer);
  }, [slides.length, interval]);

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
  };

  if (slides.length === 0) return null;

  return (
    <div className="hidden lg:flex lg:w-1/2 relative bg-black items-center justify-center overflow-hidden h-full min-h-screen">
      {slides.map((slide, index) => (
        <div
          key={index}
          className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
            index === currentIndex ? "opacity-100 z-10" : "opacity-0 z-0"
          }`}
        >
          {/* Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-violet-600/30 via-transparent to-fuchsia-600/30 z-10" />
          
          {/* Background Image */}
          <div 
            className="absolute inset-0 bg-cover bg-center opacity-50 transition-transform duration-[10000ms] ease-linear"
            style={{ 
              backgroundImage: `url('${slide.image}')`,
              transform: index === currentIndex ? 'scale(1.1)' : 'scale(1.0)'
            }} 
          />
        </div>
      ))}

      {/* Content */}
      <div className="relative z-20 p-12 text-white max-w-xl w-full">
        <div className="relative h-64"> {/* Fixed height container for text to prevent layout shift */}
          {slides.map((slide, index) => (
            <div
              key={index}
              className={`absolute top-0 left-0 w-full transition-all duration-700 ease-out transform ${
                index === currentIndex 
                  ? "opacity-100 translate-y-0" 
                  : "opacity-0 translate-y-8"
              }`}
            >
              <h2 className="text-5xl font-bold mb-6 leading-tight">
                {slide.title}
              </h2>
              <p className="text-lg text-gray-300 mb-8">
                {slide.description}
              </p>
            </div>
          ))}
        </div>

        {/* Indicators */}
        <div className="flex gap-4 mt-8">
          {slides.map((_, index) => (
            <button
              key={index}
              onClick={() => goToSlide(index)}
              className={`h-2 rounded-full transition-all duration-300 ${
                index === currentIndex 
                  ? "w-12 bg-white opacity-100" 
                  : "w-12 bg-white opacity-30 hover:opacity-50"
              }`}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
