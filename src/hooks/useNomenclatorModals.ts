import React from 'react';

/**
 * Custom hook for managing modal open/close states commonly used in the Nomenclator UI.
 */
export function useNomenclatorModals() {
  const [isHelpOpen, setIsHelpOpen] = React.useState(false);
  const [isFrequencyOpen, setIsFrequencyOpen] = React.useState(false);
  const [isMappingPreviewUpdatedFlash, setIsMappingPreviewUpdatedFlash] = React.useState(false);
  const mappingPreviewFlashTimerRef = React.useRef<number | null>(null);

  return {
    isHelpOpen,
    setIsHelpOpen,
    isFrequencyOpen,
    setIsFrequencyOpen,
    isMappingPreviewUpdatedFlash,
    setIsMappingPreviewUpdatedFlash,
    mappingPreviewFlashTimerRef,
  };
}
