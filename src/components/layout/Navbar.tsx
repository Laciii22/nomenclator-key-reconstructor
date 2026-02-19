/**
 * Navbar: Application header with title.
 * 
 * Fixed to the top of the viewport for consistent navigation.
 */

import React from "react";
import info from '../../assets/icons/question.png';

interface NavbarProps {
  onHelpClick?: () => void;
}

/**
 * Top navigation bar with application title and help button.
 */
const Navbar: React.FC<NavbarProps> = ({ onHelpClick }) => {
    return (
        <nav className="bg-blue-500 sticky top-0 z-50 shadow-md">
            <div className="container mx-auto px-4 py-3 flex items-center justify-between">
                <h1 className="text-white text-lg font-bold">
                    HCPortal Semi-Automatic Nomenclator Key Reconstruction module
                </h1>
                {onHelpClick && (
                    <button
                        onClick={onHelpClick}
                        className="text-white hover:bg-blue-600 px-3 py-1.5 rounded transition-colors flex items-center gap-2"
                        aria-label="Open help documentation"
                    >
                        <img src={info} alt="info" className="w-5 h-5"/>
                        <span className="text-sm font-medium">Help</span>
                    </button>
                )}
            </div>
        </nav>
    );
};

export default Navbar;