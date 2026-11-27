import React, { useState } from 'react';
import { MapPin, Users, Phone, X } from 'lucide-react';
import { ClientProfile } from '../data/clientsDirectory';
import { DialogModal } from './DialogModal';

// Modal Component for Editing / Adding Client Profiles in Directorio
export function EditClientModal({
  client,
  onClose,
  onSave,
  onDelete
}: {
  client: ClientProfile;
  onClose: () => void;
  onSave: (client: ClientProfile) => void;
  onDelete?: (id: string) => void;
}) {
  const [dogName, setDogName] = useState(client.dogName || '');
  const [breed, setBreed] = useState(client.breed || '');
  const [birthYear, setBirthYear] = useState<number | ''>(client.birthYear || '');
  const [ownerName, setOwnerName] = useState(client.ownerName || '');
  const [ownerLastName, setOwnerLastName] = useState(client.ownerLastName || '');
  const [contact, setContact] = useState(client.contact || '');
  const [address, setAddress] = useState(client.address || '');
  const [relatives, setRelatives] = useState(client.relatives || '');
  const [dogNameError, setDogNameError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dogName.trim()) {
      setDogNameError('El nombre del perro es obligatorio.');
      document.getElementById('ec-dog-name')?.focus();
      return;
    }
    onSave({
      ...client,
      dogName: dogName.trim(),
      breed: breed.trim() || undefined,
      birthYear: birthYear ? Number(birthYear) : undefined,
      ownerName: ownerName.trim(),
      ownerLastName: ownerLastName.trim() || undefined,
      contact: contact.trim() || undefined,
      address: address.trim() || undefined,
      relatives: relatives.trim() || undefined
    });
  };

  return (
    <DialogModal onClose={onClose}>
      <div className="bg-superficie border border-borde rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden my-auto">
        <div className="px-5 py-4 border-b border-borde flex items-center justify-between bg-fondo/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-acento/10 border border-acento/40 text-acento-texto">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-texto text-base">
                {client.ownerName || client.dogName ? `Ficha: ${client.dogName || 'Nuevo'}` : 'Nueva Ficha Canina'}
              </h3>
              <p className="text-sm text-texto-sec">Editar datos del huésped y contacto del cliente</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="min-w-12 min-h-12 flex items-center justify-center rounded-lg text-texto-sec hover:text-texto hover:bg-superficie-alt transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Perro & Raza */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="ec-dog-name" className="text-sm font-semibold text-texto-sec block mb-1">Nombre del Perro / Huésped *</label>
              <input
                id="ec-dog-name"
                type="text"
                required
                value={dogName}
                onChange={e => { setDogName(e.target.value); setDogNameError(''); }}
                aria-invalid={dogNameError ? true : undefined}
                aria-describedby={dogNameError ? 'ec-dog-name-error' : undefined}
                placeholder="Ej. Pupi, Manchita..."
                className={`w-full bg-fondo border rounded-xl px-3 py-2 text-sm text-texto focus:border-acento ${dogNameError ? 'border-error' : 'border-borde-fuerte'}`}
              />
              {dogNameError && <p id="ec-dog-name-error" role="alert" className="text-error text-sm mt-1">{dogNameError}</p>}
            </div>
            <div>
              <label htmlFor="ec-breed" className="text-sm font-semibold text-texto-sec block mb-1">Raza</label>
              <input
                id="ec-breed"
                type="text"
                value={breed}
                onChange={e => setBreed(e.target.value)}
                placeholder="Ej. Caniche, Mestizo..."
                className="w-full bg-fondo border border-borde-fuerte rounded-xl px-3 py-2 text-sm text-texto focus:border-acento "
              />
            </div>
          </div>

          {/* Dueño/a Nombre & Apellido */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="ec-owner-name" className="text-sm font-semibold text-texto-sec block mb-1">Dueño/a (Nombre) *</label>
              <input
                id="ec-owner-name"
                type="text"
                value={ownerName}
                onChange={e => setOwnerName(e.target.value)}
                placeholder="Ej. Laura"
                className="w-full bg-fondo border border-borde-fuerte rounded-xl px-3 py-2 text-sm text-texto focus:border-acento "
              />
            </div>
            <div>
              <label htmlFor="ec-owner-lastname" className="text-sm font-semibold text-texto-sec block mb-1">Dueño/a (Apellido)</label>
              <input
                id="ec-owner-lastname"
                type="text"
                value={ownerLastName}
                onChange={e => setOwnerLastName(e.target.value)}
                placeholder="Ej. Gómez"
                className="w-full bg-fondo border border-borde-fuerte rounded-xl px-3 py-2 text-sm text-texto focus:border-acento "
              />
            </div>
          </div>

          {/* Teléfono & Año Nacimiento */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="ec-phone" className="text-sm font-semibold text-texto-sec block mb-1 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-exito" />
                <span>Teléfono de Contacto</span>
              </label>
              <input
                id="ec-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={contact}
                onChange={e => setContact(e.target.value)}
                placeholder="Ej. 555-0101"
                className="w-full bg-fondo border border-borde-fuerte rounded-xl px-3 py-2 text-sm text-texto font-mono focus:border-acento "
              />
            </div>
            <div>
              <label htmlFor="ec-birth-year" className="text-sm font-semibold text-texto-sec block mb-1">Año de Nacimiento (Opcional)</label>
              <input
                id="ec-birth-year"
                type="number"
                min="2000"
                max="2030"
                value={birthYear}
                onChange={e => setBirthYear(e.target.value ? Number(e.target.value) : '')}
                placeholder="Ej. 2021"
                className="w-full bg-fondo border border-borde-fuerte rounded-xl px-3 py-2 text-sm text-texto font-mono focus:border-acento "
              />
            </div>
          </div>

          {/* Dirección */}
          <div>
            <label htmlFor="ec-address" className="text-sm font-semibold text-texto-sec block mb-1 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-acento-texto" />
              <span>Dirección de Retiro / Domicilio</span>
            </label>
            <input
              id="ec-address"
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="Ej. Calle Falsa 123, 4° B"
              className="w-full bg-fondo border border-borde-fuerte rounded-xl px-3 py-2 text-sm text-texto focus:border-acento "
            />
          </div>

          {/* Familiares / Contactos Alternativos */}
          <div>
            <label htmlFor="client-relatives" className="text-sm font-semibold text-texto-sec block mb-1">Familiares / Contactos Alternativos</label>
            <textarea
              id="client-relatives"
              rows={2}
              value={relatives}
              onChange={e => setRelatives(e.target.value)}
              placeholder="Ej. Madre: Claudia (11...), Hija: Sol..."
              className="w-full bg-fondo border border-borde-fuerte rounded-xl px-3 py-2 text-sm text-texto focus:border-acento resize-none"
            />
          </div>

          {/* Botones de acción */}
          <div className="pt-3 border-t border-borde flex items-center justify-between gap-2">
            {onDelete && client.id && (
              <button
                type="button"
                onClick={() => onDelete(client.id)}
                className="px-3 py-2 text-sm font-semibold text-error hover:text-error hover:bg-error/20 rounded-xl border border-error transition-colors cursor-pointer"
              >
                Eliminar Ficha
              </button>
            )}
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-semibold text-texto-sec hover:text-texto hover:bg-superficie-alt rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-sm font-bold rounded-xl bg-acento hover:bg-acento-hover text-acento-fg transition-all shadow-md cursor-pointer active:scale-95"
              >
                Guardar Ficha
              </button>
            </div>
          </div>
        </form>
      </div>
    </DialogModal>
  );
}
