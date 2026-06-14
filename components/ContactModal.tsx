import React from 'react';
import { type Player } from '../types';
import { PhoneIcon, WhatsAppIcon } from './Icons';

interface ContactModalProps {
  player: Player;
  onClose: () => void;
}

const ContactModal: React.FC<ContactModalProps> = ({ player, onClose }) => {
  const normalizedPhone = player.phone?.replace(/\D/g, '') ?? '';
  const telPhone = player.phone?.replace(/[^\d+]/g, '') ?? '';
  const hasPhone = normalizedPhone.length > 0;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-fadeIn" onClick={onClose}>
      <div className="bg-secondary rounded-xl shadow-2xl p-6 w-full max-w-sm border border-tertiary" onClick={e => e.stopPropagation()}>
        <div className="flex flex-col items-center">
          <img src={player.avatar} alt={player.name} className="w-24 h-24 rounded-full mb-4 border-4 border-accent object-cover"/>
          <h4 className="text-xl font-bold mb-2">{player.name}</h4>
          <div className="space-y-4 w-full mt-4">
            {hasPhone ? (
              <>
                <a 
                  href={`tel:${telPhone}`}
                  className="flex items-center justify-center gap-3 w-full bg-tertiary hover:bg-tertiary/80 text-text-primary font-bold py-3 px-4 rounded-lg transition-colors"
                >
                    <PhoneIcon className="w-5 h-5"/>
                    <span>Chiama</span>
                </a>
                <a
                  href={`https://wa.me/${normalizedPhone}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-3 w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition-colors"
                >
                  <WhatsAppIcon className="w-6 h-6"/>
                  <span>WhatsApp</span>
                </a>
              </>
            ) : (
              <div className="rounded-lg border border-tertiary bg-primary/60 px-4 py-3 text-center text-sm text-text-secondary">
                Numero non disponibile
              </div>
            )}
          </div>
          <button
              onClick={onClose}
              className="mt-6 bg-tertiary hover:bg-tertiary/80 text-text-primary font-bold py-2 px-4 rounded-lg transition-colors w-full"
            >
              Chiudi
            </button>
        </div>
      </div>
    </div>
  );
};

export default ContactModal;