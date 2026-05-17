"use client";

import Polaroid, { type polaroidVariants } from "./Polaroid";
import { navigate } from "astro:transitions/client";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

interface TImage {
  src: string;
  variant: keyof typeof polaroidVariants;
}

interface PolaroidGalleryProps {
  images: TImage[];
  event: string;
  title?: string;
}

const PolaroidGallery = ({ images, event }: PolaroidGalleryProps) => {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const displayImages = images.slice(0, 6);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleClick = () => {
    navigate(`/photo-wall/${event}`);
  };

  const cardWidth = 128;
  const spacing = 32;
  const totalWidth = (displayImages.length - 1) * spacing + cardWidth;
  const offsetLeft = -(totalWidth / 2 - cardWidth / 2);

  return (
    <motion.div
      ref={ref}
      className="relative w-full cursor-pointer flex items-center justify-center overflow-visible"
      style={{
        height: "210px",
        minHeight: "210px"
      }}
      onClick={handleClick}
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.2 }}
    >
      <div 
        className="relative" 
        style={{ 
          width: `${totalWidth}px`, 
          height: "190px",
          marginLeft: `${offsetLeft}px`
        }}
      >
        {displayImages.map((image, index) => (
          <Polaroid
            isVisible={isVisible}
            index={index}
            total={displayImages.length}
            key={image.src}
            variant={image.variant}
            onClick={handleClick}
            src={image.src}
          />
        ))}
      </div>
    </motion.div>
  );
};

export default PolaroidGallery;
