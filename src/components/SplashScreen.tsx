import React from 'react';
import './SplashScreen.css';

interface SplashScreenProps {
    onSelectApp: (app: 'piano' | 'drums') => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onSelectApp }) => {
    return (
        <div className="splash-container">
            <div className="splash-title-wrapper">
                <h1 className="splash-title">Midi Stroke</h1>
                <p className="splash-subtitle">Select your instrument</p>
            </div>

            <div className="splash-cards-container">
                <div
                    className="app-card card-piano"
                    onClick={() => onSelectApp('piano')}
                >
                    <div className="app-icon">🎹</div>
                    <div className="app-name">Piano</div>
                </div>

                <div
                    className="app-card card-drums"
                    onClick={() => onSelectApp('drums')}
                >
                    <div className="app-badge">New</div>
                    <div className="app-icon">🥁</div>
                    <div className="app-name">Drums</div>
                </div>
            </div>
        </div>
    );
};
