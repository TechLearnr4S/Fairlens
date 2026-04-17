import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input, PasswordInput } from '../../components/ui/Input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../../components/ui/Card';
import { ShieldCheck } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const { login, loginWithGoogle } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setError('');
    setIsGoogleLoading(true);
    
    try {
      await loginWithGoogle();
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Google Auth failed. Please try again.');
    } finally {
      setIsGoogleLoading(false);
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
        <CardTitle>Welcome back</CardTitle>
        <CardDescription>Enter your credentials to access your audits</CardDescription>
      </CardHeader>
      
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm text-center break-words">
              {error}
            </div>
          )}
          
          <Button 
            fullWidth 
            type="button" 
            variant="secondary" 
            isLoading={isGoogleLoading} 
            disabled={isLoading || isGoogleLoading}
            onClick={handleGoogleAuth}
            className="bg-white hover:bg-slate-100 text-slate-800 border-none justify-center shadow-md font-semibold"
          >
           <svg className="w-5 h-5 mr-3" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M47.532 24.5528C47.532 22.9214 47.3997 21.2811 47.1175 19.6761H24.48V28.5181H37.4434C36.9055 31.4396 35.177 33.9244 32.6461 35.5877V41.3692H40.4024C44.9239 37.1032 47.532 31.055 47.532 24.5528Z" fill="#4285F4"/>
              <path d="M24.48 48.0016C30.9525 48.0016 36.4116 45.8764 40.4024 41.3692L32.6461 35.5877C30.503 37.0457 27.7259 37.8996 24.48 37.8996C18.2253 37.8996 12.9231 33.7258 11.0264 28.0935H3.04873V34.1952C7.18738 42.1866 15.352 48.0016 24.48 48.0016Z" fill="#34A853"/>
              <path d="M11.0264 28.0935C10.0211 25.132 10.0211 21.9056 11.0264 18.9441V12.8424H3.04873C-0.344212 19.5539 -0.344212 27.4836 3.04873 34.1952L11.0264 28.0935Z" fill="#FBBC04"/>
              <path d="M24.48 10.1042C27.9157 10.0381 31.2335 11.3415 33.7196 13.6826L40.5284 6.9406C36.1958 2.87352 30.3956 0.53696 24.48 0.5896C15.352 0.5896 7.18738 6.40462 3.04873 14.396L11.0264 20.4977C12.9231 14.8654 18.2253 10.1042 24.48 10.1042Z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </Button>

          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t border-slate-700/50"></div>
            <span className="flex-shrink-0 mx-4 text-slate-500 text-xs font-semibold">OR EMAIL</span>
            <div className="flex-grow border-t border-slate-700/50"></div>
          </div>
          
          <Input 
            label="Work Email" 
            placeholder="name@company.com" 
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            disabled={isLoading || isGoogleLoading}
          />
          
          <div className="space-y-1">
            <PasswordInput 
              label="Password" 
              placeholder="••••••••" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              disabled={isLoading || isGoogleLoading}
            />
            <div className="flex justify-end">
              <Link to="/forgot-password" className="text-xs text-primary-400 hover:text-primary-300 font-medium">
                Forgot password?
              </Link>
            </div>
          </div>
        </CardContent>
        
        <CardFooter>
          <Button fullWidth type="submit" isLoading={isLoading} disabled={isGoogleLoading}>
            Sign In with Email
          </Button>
          <p className="w-full text-center text-sm text-slate-400">
            Don't have an account? <Link to="/signup" className="text-primary-400 hover:text-primary-300 font-medium">Request access</Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
