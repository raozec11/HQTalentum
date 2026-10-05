import { useEffect, useRef } from "react";

/**
 * Custom hook to attach Google Places Autocomplete to an input element by its ID.
 * @param inputId The HTML ID of the input element.
 * @param onAddressSelect Callback function that receives the formatted address string.
 */
export function useAddressAutocomplete(inputId: string, onAddressSelect: (address: string) => void) {
  const autocompleteRef = useRef<any>(null);

  useEffect(() => {
    let timer: NodeJS.Timeout;

    async function init() {
      const g = (window as any).google;
      if (!g || !g.maps) {
        timer = setTimeout(init, 500);
        return;
      }

      try {
        // Modern Way to call the Library
        const { Autocomplete } = await g.maps.importLibrary("places");

        const inputElement = document.getElementById(inputId) as HTMLInputElement;
        if (!inputElement) return;

        // Ensure the input is visible (in case it was hidden by previous code)
        inputElement.style.display = 'block';

        // Initialize Autocomplete on the existing input (Old Design)
        autocompleteRef.current = new Autocomplete(inputElement, {
          types: ["address"],
          fields: ["formatted_address", "geometry"],
        });

        // Handle selection
        autocompleteRef.current.addListener("place_changed", () => {
          const place = autocompleteRef.current?.getPlace();
          if (place?.formatted_address) {
            onAddressSelect(place.formatted_address);
          }
        });
      } catch (err) {
        console.error("Error loading Google Places library:", err);
      }
    }

    init();

    // Cleanup
    return () => {
      clearTimeout(timer);
      const gClean = (window as any).google;
      const inputElement = document.getElementById(inputId) as HTMLInputElement;
      if (gClean && gClean.maps && gClean.maps.event && inputElement) {
        gClean.maps.event.clearInstanceListeners(inputElement);
      }
      const pacContainers = document.querySelectorAll('.pac-container');
      pacContainers.forEach(container => container.remove());
    };
  }, [inputId, onAddressSelect]);
}
