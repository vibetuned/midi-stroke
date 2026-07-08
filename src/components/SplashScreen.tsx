import React from 'react';
import './SplashScreen.css';

interface SplashScreenProps {
    onSelectApp: (app: 'piano' | 'drums' | 'saxo' | 'theory') => void;
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
                    <div className="app-badge">New Features</div>
                    <div className="app-icon">🎹</div>
                    <div className="app-name">Piano</div>
                </div>

                <div
                    className="app-card card-drums"
                    onClick={() => onSelectApp('drums')}
                >

                    <div className="app-icon">🥁</div>
                    <div className="app-name">Drums</div>
                </div>

                <div
                    className="app-card card-saxo"
                    onClick={() => onSelectApp('saxo')}
                >
                    <div className="app-badge">Experimental</div>
                    <div className="app-icon">🎷</div>
                    <div className="app-name">Saxo</div>
                </div>

                <div
                    className="app-card card-theory"
                    onClick={() => onSelectApp('theory')}
                >
                    <div className="app-badge">New</div>
                    <div className="app-icon">🎼</div>
                    <div className="app-name">Theory</div>
                </div>
            </div>
        </div>
    );
};
