import { motion } from "motion/react";
import { useMemo, useState } from "react";

export const polaroidVariants = {
  "1x1": "w-32 h-32",
  "4x5": "w-32 h-40",
  "4x3": "w-32 h-24",
  "9x16": "w-32 h-48",
};

interface PolaroidProps {
  src: string;
  index?: number;
  total?: number;
  isVisible?: boolean;
  variant: keyof typeof polaroidVariants;
  onClick?: () => void;
  fullscreen?: boolean;
}

const Polaroid = ({
  src,
  variant,
  onClick,
  fullscreen,
  index = 0,
  total = 0,
  isVisible,
}: PolaroidProps) => {
  const variantClasses = polaroidVariants[variant] || polaroidVariants["1x1"];
  const randomRotation = useMemo(() => Math.random() * 30 - 15, []);
  const [loaded, setLoaded] = useState(false);

  return (
    <motion.div
      onClick={onClick}
      variants={{
        hidden: { scale: 0, rotate: 0, zIndex: total - index, opacity: 0 },
        show: {
          scale: 1,
          rotate: fullscreen ? 0 : randomRotation,
          opacity: 1,
          y: 0,
        },
      }}
      initial="hidden"
      animate={isVisible ? "show" : "hidden"}
      whileInView="visible"
      viewport={{ once: true }}
      transition={{
        delay: index * 0.1,
        duration: 0.6,
        type: "spring",
        stiffness: 260,
        damping: 20,
      }}
      whileHover={{
        rotate: 0,
        scale: 1.2,
        y: -12,
        zIndex: total + 10,
        cursor: "zoom-in",
        transition: {
          duration: 0.3,
          type: "spring",
          stiffness: 300,
          damping: 20,
        },
      }}
      whileTap={{
        scale: 0.95,
        transition: { duration: 0.1 },
      }}
      className={`w-32 h-auto shadow-lg z-10 absolute group ${fullscreen ? "w-full h-full" : ""}`}
      style={{
        left: `${index * 32}px`,
        top: `${index % 2 === 0 ? 12 : 32}px`,
        zIndex: total - index,
      }}
    >
      <motion.div
        className={`w-auto h-auto relative overflow-hidden ${fullscreen ? "h-auto min-w-72" : variantClasses}`}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-white via-gray-50 to-gray-100 rounded-sm" />
        
        <div className="relative bg-white p-1 rounded-sm h-full flex items-center justify-center">
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-base-200/50 backdrop-blur-[2px] z-10 m-1 rounded-sm">
              <span className="loading loading-infinity w-6 text-primary/80"></span>
            </div>
          )}
          <img
            className={`object-cover rounded-sm transition-all duration-300 group-hover:scale-105 w-full h-full ${loaded ? 'opacity-100' : 'opacity-0'}`}
            src={src}
            alt=""
            onLoad={() => setLoaded(true)}
            onError={() => setLoaded(true)}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent rounded-sm pointer-events-none" />
        </div>
        
        <div className="absolute inset-0 border border-gray-200/50 rounded-sm pointer-events-none" />
      </motion.div>
      
      <motion.div
        className="absolute inset-0 shadow-xl opacity-0 rounded-sm pointer-events-none"
        whileHover={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      />
    </motion.div>
  );
};

export default Polaroid;
