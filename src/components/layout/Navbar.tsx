/**
 * Navbar: Application header with title.
 * 
 * Fixed to the top of the viewport for consistent navigation.
 */

import React from "react";
import info from '../../assets/icons/question.png';

interface NavbarProps {
  onHelpClick?: () => void;
  onFrequencyClick?: () => void;
}

/**
 * Top navigation bar with application title and help button.
 */
const Navbar: React.FC<NavbarProps> = ({ onHelpClick, onFrequencyClick }) => {
    return (
        <nav className="bg-blue-700 sticky top-0 z-50 shadow-lg border-b border-blue-800">
            <div className="container mx-auto px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div>
                        <h1 className="text-white text-base font-bold leading-tight">
                            Nomenclator Key Reconstructor
                        </h1>
                        <p className="text-blue-200 text-xs leading-tight">HCPortal — Semi-automatic cipher key reconstruction</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {onFrequencyClick && (
                        <button
                            onClick={onFrequencyClick}
                            className="text-white hover:bg-blue-600 px-3 py-1.5 rounded-md transition-colors flex items-center gap-2 border border-blue-500 hover:border-blue-400"
                            aria-label="Show token frequency"
                        >
                            <svg className="w-4 h-4 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                            <span className="text-sm font-medium">Frequency</span>
                        </button>
                    )}
                    {onHelpClick && (
                        <button
                            onClick={onHelpClick}
                            className="text-white hover:bg-blue-600 px-3 py-1.5 rounded-md transition-colors flex items-center gap-2 border border-blue-500 hover:border-blue-400"
                            aria-label="Open help documentation"
                        >
                            <img src={info} alt="info" className="w-4 h-4"/>
                            <span className="text-sm font-medium">Help</span>
                        </button>
                    )}
                </div>
            </div>
        </nav>
    );
};

export default Navbar;