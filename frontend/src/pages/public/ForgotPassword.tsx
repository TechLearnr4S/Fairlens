import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../../components/ui/Card';
import { ShieldCheck, ArrowLeft, CheckCircle } from 'lucide-react';
import { authService } from '../../features/auth/authService';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    try {
      await authService.resetPassword(email);
      setIsSent(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send reset link.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-center mb-4">
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-primary-500/25">
            <ShieldCheck size={28} className="text-white" />
          </div>
        </div>
        <CardTitle>Reset Password</CardTitle>
        <CardDescription>
          {isSent 
            ? "Check your email for a reset link." 
            : "Enter your email to receive a password reset link."}
        </CardDescription>
      </CardHeader>
      
      {!isSent ? (
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm text-center">
                {error}
              </div>
            )}
            
            <Input 
              label="Work Email" 
              placeholder="name@company.com" 
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </CardContent>
          
          <CardFooter>
            <Button fullWidth type="submit" isLoading={isLoading}>
              Send Reset Link
            </Button>
            <div className="w-full text-center mt-4">
              <Link to="/login" className="inline-flex items-center text-sm text-slate-400 hover:text-slate-200">
                <ArrowLeft size={16} className="mr-2" /> Back to log in
              </Link>
            </div>
          </CardFooter>
        </form>
      ) : (
        <CardContent className="flex flex-col items-center py-6">
          <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center mb-4">
            <CheckCircle className="text-emerald-400" size={24} />
          </div>
          <p className="text-center text-slate-300 mb-6">
            We've sent an email to <span className="font-semibold text-white">{email}</span> with instructions to reset your password.
          </p>
          <Link to="/login" className="w-full">
            <Button fullWidth variant="secondary">
              Return to log in
            </Button>
          </Link>
        </CardContent>
      )}
    </Card>
  );
}
